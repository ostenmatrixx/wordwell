import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Crown,
  Download,
  Eye,
  Flag,
  Gamepad2,
  History,
  Link2,
  ListOrdered,
  LoaderCircle,
  LockKeyhole,
  Medal,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanText,
  Send,
  Shuffle,
  SkipForward,
  Sparkles,
  Trophy,
  UserMinus,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import { AnswerReview } from './components/AnswerReview'
import { BoardEditor } from './components/BoardEditor'
import { CameraCapture } from './components/CameraCapture'
import {
  OnlineWordEntry,
  type OnlineWord,
  type OnlineWordSyncState,
} from './components/OnlineWordEntry'
import { generateWordFactoryBoard } from './lib/board-generator'
import {
  answerTextToDraftRows,
  captureDraftKey,
  capturePhotoKey,
  createAnswerDraftRow,
  createAnswerDraftRows,
  createCaptureStore,
  createTesseractOcrAdapter,
  recognizeGridCells,
  updateAnswerDraftRow,
  type AnswerDraftRow,
} from './lib/capture'
import { splitBoardImageIntoCells } from './lib/grid'
import { evaluateGridRound } from './lib/round-engine'
import { lookupWordDefinition, type WordDefinition } from './lib/definitions'
import { buildGameSummary } from './lib/game-summary'
import {
  applyWordOverride,
  checkScrabbleTurn,
  closeRoomRound,
  confirmRoundBoard,
  confirmRoundSubmission,
  createNextRound,
  createRoom,
  ensureRoomAuth,
  expireGeneratedRound,
  fetchRoomState,
  finalizeRoomRound,
  finishRoomGame,
  getFrozenRoundSnapshot,
  isRoomsSupabaseConfigured,
  joinRoom,
  openRoundSubmissions,
  passScrabbleTurn,
  pauseRoomRound,
  publishRoundResults,
  removeRoomMember,
  resumeRoomRound,
  startGeneratedRound,
  startRoomRound,
  startScrabbleRoom,
  submitScrabbleScore,
  skipScrabbleTurn,
  subscribeToRoom,
  subscribeToRound,
  type BoardSource,
  voidScrabbleScore,
  type GameRound,
  type RoomJoin,
  type RoomMember,
  type RoomMode,
  type RoomPresence,
  type RoomState,
  type RoundWordResult,
} from './lib/rooms'
import { scoreWord } from './lib/scoring'
import { loadHistory } from './lib/storage'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type LandingView = 'home' | 'create' | 'join'
type CaptureKind = 'board' | 'answers' | null
type StoredRoom = RoomJoin & { roomCode?: string }

const ACTIVE_ROOM_KEY = 'wordwell:multiplayer-room:v1'
const ONLINE_DRAFT_SUFFIX = ':generated'
const PLAYER_COLORS = ['coral', 'mint', 'lemon', 'lilac', 'blue', 'peach']
const captureStore = createCaptureStore()

const MODES: Array<{ id: RoomMode; label: string; short: string; color: string }> = [
  { id: 'scrabble', label: 'Scrabble', short: 'Dictionary checker · manual board score', color: 'lemon' },
  { id: 'boggle', label: 'Boggle', short: '3+ letters · duplicates cancel', color: 'mint' },
  { id: 'scribbage', label: 'Scribbage / Word Factory', short: 'Generated or physical · 4+ letters', color: 'lilac' },
]

function modeLabel(mode: RoomMode) {
  return MODES.find((item) => item.id === mode)?.label ?? mode
}

function readStoredRoom(): StoredRoom | null {
  try {
    const value = localStorage.getItem(ACTIVE_ROOM_KEY)
    return value ? JSON.parse(value) as StoredRoom : null
  } catch {
    return null
  }
}

function saveStoredRoom(room: StoredRoom | null) {
  if (room) localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room))
  else localStorage.removeItem(ACTIVE_ROOM_KEY)
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Something went wrong. Please try again.'
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function roundSeconds(round: GameRound, now: number) {
  if (round.phase !== 'playing' || !round.timerStartedAt || round.timerPausedAt) return round.timerRemainingSeconds
  const elapsed = Math.max(0, Math.floor((now - Date.parse(round.timerStartedAt)) / 1000))
  return Math.max(0, round.timerRemainingSeconds - elapsed)
}

function roundCountdown(round: GameRound, now: number) {
  if (round.phase !== 'playing' || !round.timerStartedAt) return 0
  return Math.max(0, Math.ceil((Date.parse(round.timerStartedAt) - now) / 1000))
}

function onlineDraftKey(roundId: string, memberId: string) {
  return `${captureDraftKey(roundId, memberId)}${ONLINE_DRAFT_SUFFIX}`
}

type StoredOnlineDraft = {
  words: OnlineWord[]
  revision: number
  clientToken: string
  dirty: boolean
}

function resultReason(result: RoundWordResult) {
  if (result.crossPlayerDuplicate) return 'Matched another player'
  if (result.selfDuplicate) return 'Repeated on this list'
  if (!result.formatValid) return 'Letters only'
  if (!result.minimumLengthValid) return 'Too short'
  if (!result.dictionaryValid) return 'Not in SOWPODS'
  if (!result.gridValid) return 'No path on the board'
  return 'Valid word'
}

function App() {
  const [dictionary, setDictionary] = useState<ReadonlySet<string> | null>(null)
  const [landingView, setLandingView] = useState<LandingView>('home')
  const [activeRoom, setActiveRoom] = useState<StoredRoom | null>(() => readStoredRoom())
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [realtimeState, setRealtimeState] = useState('CLOSED')
  const [presence, setPresence] = useState<RoomPresence[]>([])
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [now, setNow] = useState(Date.now())

  const [createMode, setCreateMode] = useState<RoomMode>('boggle')
  const [boardSource, setBoardSource] = useState<BoardSource>('generated')
  const [playerLimit, setPlayerLimit] = useState(4)
  const [hostPlaying, setHostPlaying] = useState(true)
  const [hostName, setHostName] = useState('Host')
  const [gridSize, setGridSize] = useState<4 | 5>(4)
  const [timerSeconds, setTimerSeconds] = useState(180)
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')

  const [boardCells, setBoardCells] = useState<string[]>(Array(16).fill(''))
  const [boardReviewCells, setBoardReviewCells] = useState<boolean[]>(Array(16).fill(false))
  const [captureKind, setCaptureKind] = useState<CaptureKind>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState('')
  const [answerRows, setAnswerRows] = useState<AnswerDraftRow[]>([])
  const [submissionMode, setSubmissionMode] = useState<'draft' | 'queued' | 'submitted' | 'rejected'>('draft')
  const [queuedSubmission, setQueuedSubmission] = useState<{ clientToken: string; revision: number } | null>(null)
  const [scrabbleWord, setScrabbleWord] = useState('')
  const [scrabblePoints, setScrabblePoints] = useState('')
  const [scrabbleInvalidNotice, setScrabbleInvalidNotice] = useState<string | null>(null)
  const [scrabbleDefinition, setScrabbleDefinition] = useState<WordDefinition | null>(null)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [onlineWords, setOnlineWords] = useState<OnlineWord[]>([])
  const [onlineSyncState, setOnlineSyncState] = useState<OnlineWordSyncState>('not-submitted')

  const onlineWordsRef = useRef<OnlineWord[]>([])
  const onlineScopeRef = useRef<string | null>(null)
  const onlineRevisionRef = useRef(0)
  const onlineClientTokenRef = useRef('')
  const onlineDirtyRef = useRef(false)
  const onlineSaveSequenceRef = useRef(0)
  const onlineSaveTimerRef = useRef<number | null>(null)
  const onlineSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const processingRoundRef = useRef<string | null>(null)
  const processingRetryAtRef = useRef(0)

  const currentRound = roomState?.rounds.at(-1) ?? null
  const me = roomState?.members.find((member) => member.id === activeRoom?.memberId) ?? null
  const isHost = Boolean(me?.isHost ?? activeRoom?.isHost)
  const players = roomState?.members.filter((member) => member.isPlayer && !member.removedAt) ?? []
  const scrabbleTurnPlayers = roomState?.session.scrabbleTurnOrder
    .map((memberId) => players.find((player) => player.id === memberId))
    .filter((player): player is RoomMember => Boolean(player)) ?? []
  const currentScrabblePlayer = scrabbleTurnPlayers[
    roomState?.session.scrabbleTurnIndex ?? 0
  ] ?? null
  const isMyScrabbleTurn = Boolean(
    roomState?.session.mode === 'scrabble'
    && roomState.session.status === 'active'
    && me?.isPlayer
    && currentScrabblePlayer?.id === me.id,
  )
  const legacyHistory = useMemo(() => loadHistory().filter((session) => session.status === 'complete'), [])
  const timerRemaining = currentRound ? roundSeconds(currentRound, now) : 0
  const countdownRemaining = currentRound ? roundCountdown(currentRound, now) : 0

  const refreshRoom = useCallback(async (quiet = false) => {
    if (!activeRoom?.sessionId || !isRoomsSupabaseConfigured || !navigator.onLine) return
    if (!quiet) setBusy(true)
    try {
      const state = await fetchRoomState(activeRoom.sessionId)
      if (state) setRoomState(state)
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      if (!quiet) setBusy(false)
    }
  }, [activeRoom?.sessionId])

  useEffect(() => {
    let active = true
    void import('./lib/dictionary').then((module) => { if (active) setDictionary(module.dictionary) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const online = () => { setIsOnline(true); void refreshRoom(true) }
    const offline = () => setIsOnline(false)
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('beforeinstallprompt', install)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('beforeinstallprompt', install)
    }
  }, [refreshRoom])

  useEffect(() => { if (activeRoom) void refreshRoom() }, [activeRoom, refreshRoom])

  useEffect(() => {
    if (!activeRoom?.sessionId || !isRoomsSupabaseConfigured) return
    const onChange = () => void refreshRoom(true)
    const leaveRoom = subscribeToRoom(activeRoom.sessionId, onChange, setRealtimeState, setPresence)
    const leaveRound = currentRound ? subscribeToRound(currentRound.id, onChange) : () => undefined
    return () => { leaveRoom(); leaveRound() }
  }, [activeRoom?.sessionId, currentRound?.id, refreshRoom])

  useEffect(() => {
    if (!currentRound || !me) return
    const key = captureDraftKey(currentRound.id, me.id)
    void captureStore.loadDraft<{ rows: AnswerDraftRow[]; mode: typeof submissionMode; queued?: { clientToken: string; revision: number } | null }>(key).then((saved) => {
      if (!saved || answerRows.length) return
      setAnswerRows(saved.rows)
      setSubmissionMode(saved.mode)
      setQueuedSubmission(saved.queued ?? null)
    })
  }, [currentRound?.id, me?.id])

  useEffect(() => {
    if (!currentRound || !me) return
    void captureStore.saveDraft(captureDraftKey(currentRound.id, me.id), { rows: answerRows, mode: submissionMode, queued: queuedSubmission })
  }, [answerRows, submissionMode, queuedSubmission, currentRound?.id, me?.id])

  useEffect(() => {
    if (roomState?.session.boardSource !== 'generated' || !currentRound || currentRound.phase !== 'playing' || !me?.isPlayer) {
      onlineScopeRef.current = null
      onlineWordsRef.current = []
      setOnlineWords([])
      setOnlineSyncState(currentRound && currentRound.phase !== 'board_setup' ? 'locked' : 'not-submitted')
      return
    }

    const scope = `${currentRound.id}:${me.id}`
    if (onlineScopeRef.current === scope) return
    onlineScopeRef.current = scope
    onlineSaveSequenceRef.current = 0
    onlineSaveChainRef.current = Promise.resolve()

    const receipt = roomState.submissions.find((submission) => submission.roundId === currentRound.id && submission.memberId === me.id)
    const serverWords = receipt
      ? roomState.words
        .filter((word) => word.submissionId === receipt.id)
        .sort((left, right) => left.position - right.position)
        .map((word) => ({ id: word.id, value: word.rawText }))
      : []

    onlineWordsRef.current = serverWords
    onlineRevisionRef.current = receipt?.revision ?? 0
    onlineClientTokenRef.current = receipt?.clientToken || crypto.randomUUID()
    onlineDirtyRef.current = false
    setOnlineWords(serverWords)
    setOnlineSyncState(receipt ? 'saved' : navigator.onLine ? 'not-submitted' : 'offline')

    void captureStore.loadDraft<StoredOnlineDraft>(onlineDraftKey(currentRound.id, me.id)).then((saved) => {
      if (onlineScopeRef.current !== scope) return
      if (onlineDirtyRef.current) return
      const useLocal = Boolean(saved && (saved.dirty || saved.revision >= (receipt?.revision ?? 0)))
      const words = useLocal && saved ? saved.words : serverWords
      const revision = Math.max(receipt?.revision ?? 0, saved?.revision ?? 0)
      onlineWordsRef.current = words
      onlineRevisionRef.current = revision
      onlineClientTokenRef.current = saved?.clientToken || receipt?.clientToken || crypto.randomUUID()
      onlineDirtyRef.current = Boolean(saved?.dirty)
      setOnlineWords(words)
      if (currentRound.phase !== 'playing') setOnlineSyncState('locked')
      else if (saved?.dirty) setOnlineSyncState(navigator.onLine ? 'not-submitted' : 'offline')
      else if (receipt) setOnlineSyncState('saved')
      else setOnlineSyncState(navigator.onLine ? 'not-submitted' : 'offline')
    })
  }, [roomState?.session.boardSource, currentRound?.id, currentRound?.phase, me?.id])

  useEffect(() => () => {
    if (onlineSaveTimerRef.current !== null) window.clearTimeout(onlineSaveTimerRef.current)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!scrabbleInvalidNotice) return
    const timeout = window.setTimeout(() => setScrabbleInvalidNotice(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [scrabbleInvalidNotice])

  useEffect(() => {
    setScrabbleWord('')
    setScrabblePoints('')
  }, [roomState?.session.scrabbleTurnNumber])

  useEffect(() => {
    const pendingWord = roomState?.session.scrabblePendingWord
    if (!pendingWord || roomState?.session.status !== 'active') {
      setScrabbleDefinition(null)
      setDefinitionLoading(false)
      return
    }

    let active = true
    setDefinitionLoading(true)
    setScrabbleDefinition(null)
    void lookupWordDefinition(pendingWord).then((definition) => {
      if (!active) return
      setScrabbleDefinition(definition)
      setDefinitionLoading(false)
    })
    return () => { active = false }
  }, [roomState?.session.scrabblePendingWord, roomState?.session.status])

  useEffect(() => {
    if (currentRound?.phase !== 'collecting' || !me) return
    const receipt = roomState?.submissions.find((submission) => submission.roundId === currentRound.id && submission.memberId === me.id)
    if (receipt && submissionMode !== 'draft') setSubmissionMode('submitted')
  }, [currentRound?.phase, roomState?.submissions, me?.id, submissionMode])

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  async function handleCreateRoom() {
    if (!isRoomsSupabaseConfigured) {
      setToast('Add the Supabase publishable key to .env.local before creating a live room.')
      return
    }
    if (hostPlaying && !hostName.trim()) { setToast('Enter your player name.'); return }
    setBusy(true)
    try {
      await ensureRoomAuth()
      const joined = await createRoom({
        mode: createMode,
        boardSource: createMode === 'scribbage' ? boardSource : 'physical',
        playerLimit,
        hostPlayerName: hostPlaying ? hostName : null,
        gridSize,
        timerSeconds,
      })
      if (!joined) throw new Error('Live rooms are not configured.')
      const stored = { ...joined, roomCode: joined.roomCode }
      saveStoredRoom(stored)
      setActiveRoom(stored)
      setLandingView('home')
      setToast(`Room ${joined.roomCode} is ready to share.`)
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinRoom() {
    if (!isRoomsSupabaseConfigured) { setToast('Live rooms need the Supabase publishable key.'); return }
    if (joinCode.replace(/\W/g, '').length !== 6 || !joinName.trim()) { setToast('Enter a six-character code and your name.'); return }
    setBusy(true)
    try {
      const joined = await joinRoom(joinCode, joinName)
      if (!joined) throw new Error('Live rooms are not configured.')
      const stored = { ...joined, roomCode: joinCode.toUpperCase() }
      saveStoredRoom(stored)
      setActiveRoom(stored)
      setLandingView('home')
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyRoomLink() {
    const code = activeRoom?.roomCode
    if (!code) return
    const text = `Join my Wordwell game with code ${code}`
    if (navigator.share) await navigator.share({ title: 'Join Wordwell', text, url: window.location.origin })
    else await navigator.clipboard.writeText(`${text} — ${window.location.origin}`)
    setToast('Invite copied and ready to share.')
  }

  async function leaveRoom() {
    saveStoredRoom(null)
    setActiveRoom(null)
    setRoomState(null)
    setAnswerRows([])
    setSubmissionMode('draft')
    setQueuedSubmission(null)
    setOnlineWords([])
    onlineWordsRef.current = []
    onlineScopeRef.current = null
    setOnlineSyncState('not-submitted')
    setScrabbleWord('')
    setScrabblePoints('')
    setScrabbleInvalidNotice(null)
    setScrabbleDefinition(null)
    setDefinitionLoading(false)
    setGridSize(4)
    setBoardCells(Array(16).fill(''))
    setBoardReviewCells(Array(16).fill(false))
  }

  function resizeBoard(nextSize: 4 | 5) {
    setGridSize(nextSize)
    setBoardCells((cells) => Array.from({ length: nextSize * nextSize }, (_, index) => cells[index] ?? ''))
    setBoardReviewCells((cells) => Array.from({ length: nextSize * nextSize }, (_, index) => cells[index] ?? false))
  }

  async function handleCapturedImage(blob: Blob, previewUrl: string) {
    setCaptureKind(null)
    URL.revokeObjectURL(previewUrl)
    if (!currentRound || !me) return
    const kind = captureKind
    if (!kind) return
    const photoKey = capturePhotoKey(currentRound.id, me.id, kind)
    await captureStore.savePhoto(photoKey, blob)
    setOcrBusy(true)
    setOcrProgress('Opening the offline reader…')
    const adapter = createTesseractOcrAdapter({
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tesseract/lang',
      parameters: kind === 'board' ? {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: '10',
        preserve_interword_spaces: '0',
        user_defined_dpi: '300',
      } : undefined,
      onProgress: ({ status, progress }) => setOcrProgress(`${status} · ${Math.round(progress * 100)}%`),
    })
    try {
      if (kind === 'board') {
        const cells = await splitBoardImageIntoCells(blob, gridSize)
        const recognized = await recognizeGridCells(cells, adapter, (done, total) => setOcrProgress(`Reading tile ${done} of ${total}`))
        setBoardCells(recognized.map((cell) => cell.suggestedValue))
        setBoardReviewCells(recognized.map((cell) => cell.needsReview))
        const reviewCount = recognized.filter((cell) => cell.needsReview).length
        setToast(
          reviewCount > 0
            ? `Rotation-aware scan complete. Check the ${reviewCount} highlighted ${reviewCount === 1 ? 'tile' : 'tiles'}.`
            : 'Rotation-aware board scan complete. Review the tiles before starting.',
        )
      } else {
        const result = await adapter.recognize(blob)
        const rows = createAnswerDraftRows(result)
        setAnswerRows(rows.length ? rows : [createAnswerDraftRow('', null, 'manual')])
        setQueuedSubmission(null)
        setSubmissionMode('draft')
        setToast('Scan complete. Review every word before confirming.')
      }
    } catch (error) {
      setToast(`${errorMessage(error)} You can still type the letters manually.`)
    } finally {
      await adapter.terminate()
      await captureStore.deletePhoto(photoKey)
      setOcrBusy(false)
      setOcrProgress('')
    }
  }

  async function confirmBoardAndStart() {
    if (!currentRound || players.length < 2) { setToast('At least two players must join first.'); return }
    const grid = Array.from({ length: gridSize }, (_, row) => boardCells.slice(row * gridSize, (row + 1) * gridSize))
    setBusy(true)
    try {
      await confirmRoundBoard(currentRound.id, grid)
      await startRoomRound(currentRound.id)
      await refreshRoom(true)
    } catch (error) { setToast(errorMessage(error)) } finally { setBusy(false) }
  }

  async function startOnlineRound() {
    if (!currentRound || players.length < 2) { setToast('At least two players must join first.'); return }
    setBusy(true)
    try {
      const grid = generateWordFactoryBoard(currentRound.gridSize)
      await startGeneratedRound(currentRound.id, grid)
      processingRetryAtRef.current = 0
      onlineScopeRef.current = null
      onlineWordsRef.current = []
      setOnlineWords([])
      setOnlineSyncState('not-submitted')
      await refreshRoom(true)
    } catch (error) { setToast(errorMessage(error)) } finally { setBusy(false) }
  }

  function persistOnlineDraft(words: OnlineWord[], dirty: boolean, revision = onlineRevisionRef.current) {
    if (!currentRound || !me) return
    if (!onlineClientTokenRef.current) onlineClientTokenRef.current = crypto.randomUUID()
    void captureStore.saveDraft<StoredOnlineDraft>(onlineDraftKey(currentRound.id, me.id), {
      words,
      revision,
      clientToken: onlineClientTokenRef.current,
      dirty,
    })
  }

  function enqueueOnlineSync(words: OnlineWord[]) {
    if (!currentRound || !me || roomState?.session.boardSource !== 'generated') return
    const scope = `${currentRound.id}:${me.id}`
    const sequence = ++onlineSaveSequenceRef.current
    const roundId = currentRound.id
    const clientToken = onlineClientTokenRef.current || crypto.randomUUID()
    onlineClientTokenRef.current = clientToken
    setOnlineSyncState('saving')

    onlineSaveChainRef.current = onlineSaveChainRef.current.catch(() => undefined).then(async () => {
      if (onlineScopeRef.current !== scope) return
      if (!navigator.onLine) throw new Error('OFFLINE')
      const revision = onlineRevisionRef.current + 1
      onlineRevisionRef.current = revision
      await confirmRoundSubmission(roundId, clientToken, revision, words.map((word) => ({
        id: word.id,
        rawText: word.value,
        normalized: word.value,
        confidence: null,
      })))
      if (onlineScopeRef.current !== scope) return
      if (sequence === onlineSaveSequenceRef.current) {
        onlineDirtyRef.current = false
        setOnlineSyncState('saved')
        persistOnlineDraft(words, false, revision)
      }
    }).catch((error: unknown) => {
      if (onlineScopeRef.current !== scope || sequence !== onlineSaveSequenceRef.current) return
      const offline = !navigator.onLine || errorMessage(error) === 'OFFLINE'
      setOnlineSyncState(offline ? 'offline' : 'not-submitted')
      persistOnlineDraft(onlineWordsRef.current, true)
      if (!offline && !/before|paused|closed|deadline|not open/i.test(errorMessage(error))) setToast(errorMessage(error))
    })
  }

  function updateOnlineWords(words: OnlineWord[], immediate: boolean) {
    onlineWordsRef.current = words
    onlineDirtyRef.current = true
    setOnlineWords(words)
    persistOnlineDraft(words, true)
    if (onlineSaveTimerRef.current !== null) window.clearTimeout(onlineSaveTimerRef.current)
    if (!navigator.onLine) {
      setOnlineSyncState('offline')
      return
    }
    if (!currentRound || currentRound.timerPausedAt || roundCountdown(currentRound, Date.now()) > 0 || roundSeconds(currentRound, Date.now()) <= 0) {
      setOnlineSyncState('not-submitted')
      return
    }
    setOnlineSyncState('saving')
    onlineSaveTimerRef.current = window.setTimeout(() => {
      onlineSaveTimerRef.current = null
      enqueueOnlineSync(words)
    }, immediate ? 0 : 350)
  }

  function addOnlineWord(word: string) {
    if (onlineWordsRef.current.length >= 250) { setToast('A round can contain up to 250 answers.'); return }
    updateOnlineWords([...onlineWordsRef.current, { id: crypto.randomUUID(), value: word }], true)
  }

  function changeOnlineWord(id: string, word: string) {
    updateOnlineWords(onlineWordsRef.current.map((item) => item.id === id ? { ...item, value: word } : item), false)
  }

  function removeOnlineWord(id: string) {
    updateOnlineWords(onlineWordsRef.current.filter((word) => word.id !== id), true)
  }

  async function roomAction(action: () => Promise<unknown>) {
    setBusy(true)
    try { await action(); await refreshRoom(true) } catch (error) { setToast(errorMessage(error)) } finally { setBusy(false) }
  }

  async function submitAnswers() {
    if (!currentRound || !me) return
    const words = answerRows.filter((row) => row.rawText.trim()).map((row) => ({
      id: row.id,
      rawText: row.rawText,
      normalized: row.normalized,
      confidence: row.confidence,
    }))
    const existing = roomState?.submissions.find((submission) => submission.roundId === currentRound.id && submission.memberId === me.id)
    const pending = queuedSubmission ?? { revision: (existing?.revision ?? 0) + 1, clientToken: crypto.randomUUID() }
    if (!navigator.onLine) {
      setQueuedSubmission(pending)
      setSubmissionMode('queued')
      setToast('Saved on this phone. Reconnect before the host closes the round.')
      return
    }
    setBusy(true)
    try {
      await confirmRoundSubmission(currentRound.id, pending.clientToken, pending.revision, words)
      setQueuedSubmission(null)
      setSubmissionMode('submitted')
      setToast(`${words.length} ${words.length === 1 ? 'word' : 'words'} submitted privately.`)
      await refreshRoom(true)
    } catch (error) {
      const message = errorMessage(error)
      const closed = /closed|not open/i.test(message)
      setSubmissionMode(closed ? 'rejected' : navigator.onLine ? 'draft' : 'queued')
      if (!closed) setQueuedSubmission(pending)
      setToast(closed ? 'The host already closed the round. Your reviewed draft is still saved on this phone.' : message)
    } finally { setBusy(false) }
  }

  async function processRound(closeMode: 'manual' | 'expired' | 'resume' = 'manual') {
    if (!currentRound || !dictionary || !roomState || processingRoundRef.current === currentRound.id) return
    const processingRoundId = currentRound.id
    processingRoundRef.current = processingRoundId
    setBusy(true)
    try {
      const latestState = await fetchRoomState(roomState.session.id) ?? roomState
      const latestRound = latestState.rounds.find((round) => round.id === processingRoundId) ?? currentRound
      let frozenRevision = latestRound.frozenRevision
      if (latestRound.phase === 'playing') {
        const closed = closeMode === 'expired'
          ? await expireGeneratedRound(latestRound.id)
          : await closeRoomRound(latestRound.id)
        if (!closed) throw new Error('Could not close this round.')
        frozenRevision = closed.frozenRevision
      } else if (latestRound.phase !== 'processing') {
        return
      }
      if (!frozenRevision) throw new Error('Could not identify the frozen round revision.')
      const snapshot = await getFrozenRoundSnapshot(latestRound.id)
      if (!snapshot) throw new Error('Could not prepare the frozen submissions.')
      const evaluation = evaluateGridRound({
        mode: latestState.session.mode === 'scribbage' ? 'scribbage' : 'boggle',
        grid: latestRound.grid,
        submissions: snapshot.submissions.map((submission) => ({
          playerId: submission.memberId,
          playerName: submission.playerName,
          words: submission.words.map((word) => ({ id: word.id, word: word.rawText })),
        })),
      }, dictionary)
      const results = evaluation.players.flatMap((player) => player.words.map((word) => ({
        wordId: word.id,
        formatValid: !word.failures.invalidCharacters,
        minimumLengthValid: !word.failures.tooShort,
        dictionaryValid: !word.failures.notInDictionary,
        gridValid: !word.failures.notOnBoard,
        selfDuplicate: word.failures.selfDuplicate,
        crossPlayerDuplicate: word.failures.crossPlayerDuplicate,
        gridPath: word.path,
        baseScore: scoreWord(word.normalized, evaluation.mode),
        score: word.score,
        eligible: word.valid,
      })))
      await publishRoundResults(latestRound.id, frozenRevision, results)
      processingRetryAtRef.current = 0
      await refreshRoom(true)
      setToast('Round revealed. Matching words have been crossed out for everyone.')
    } catch (error) {
      if (/timer is still running/i.test(errorMessage(error))) processingRetryAtRef.current = Date.now() + 5_000
      else setToast(errorMessage(error))
    } finally {
      processingRoundRef.current = null
      setBusy(false)
    }
  }

  async function closeAndReveal() {
    await processRound('manual')
  }

  async function endGeneratedRoundEarly() {
    if (!window.confirm('End the round now? All players’ lists will lock immediately.')) return
    await processRound('manual')
  }

  async function overrideResult(result: RoundWordResult, check: 'dictionary' | 'grid_path') {
    const reason = window.prompt(`Why should this ${check === 'dictionary' ? 'dictionary' : 'board path'} result be accepted?`)
    if (!reason?.trim()) return
    await roomAction(() => applyWordOverride(result.id, check, reason.trim()))
  }

  async function checkScrabbleWord() {
    const word = scrabbleWord.trim().toUpperCase()
    if (!dictionary || !word || !roomState) return
    if (!isOnline) { setToast('Reconnect before checking a Scrabble word.'); return }
    if (!isMyScrabbleTurn) { setToast(`It is ${currentScrabblePlayer?.displayName ?? 'another player'}’s turn.`); return }
    const dictionaryValid = /^[A-Z]+$/.test(word) && dictionary.has(word)
    setScrabbleWord(word)
    setBusy(true)
    try {
      const nextSession = await checkScrabbleTurn(
        roomState.session.id,
        roomState.session.scrabbleTurnNumber,
        word,
        dictionaryValid,
      )
      await refreshRoom(true)
      if (!dictionaryValid) {
        const nextMemberId = nextSession?.scrabbleTurnOrder[nextSession.scrabbleTurnIndex]
        const nextPlayer = players.find((player) => player.id === nextMemberId)
        setScrabbleInvalidNotice(
          `${word} is not accepted in SOWPODS. ${nextPlayer ? `${nextPlayer.displayName} is next.` : 'The turn has advanced.'}`,
        )
        setScrabbleWord('')
      }
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function awardScrabbleWord() {
    const points = Number.parseInt(scrabblePoints, 10)
    const pendingWord = roomState?.session.scrabblePendingWord
    if (!pendingWord || !Number.isInteger(points) || points <= 0) { setToast('Enter the positive board score for the checked word.'); return }
    if (!roomState || !isMyScrabbleTurn) { setToast('Only the current player can add this score.'); return }
    if (!isOnline) { setToast('Reconnect before adding a Scrabble score.'); return }
    setBusy(true)
    try {
      await submitScrabbleScore(
        roomState.session.id,
        crypto.randomUUID(),
        pendingWord,
        points,
        roomState.session.scrabbleTurnNumber,
      )
      setScrabbleWord('')
      setScrabblePoints('')
      await refreshRoom(true)
    } catch (error) {
      setToast(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function passCurrentScrabbleTurn() {
    if (!roomState || !isMyScrabbleTurn) return
    if (!isOnline) { setToast('Reconnect before passing the turn.'); return }
    if (!window.confirm('Pass this turn without checking a word?')) return
    await roomAction(() => passScrabbleTurn(
      roomState.session.id,
      roomState.session.scrabbleTurnNumber,
    ))
  }

  async function skipCurrentScrabbleTurn() {
    if (!roomState || !isHost) return
    if (!isOnline) { setToast('Reconnect before skipping the turn.'); return }
    const name = currentScrabblePlayer?.displayName ?? 'the current player'
    if (!window.confirm(`Skip ${name}’s turn without awarding points?`)) return
    await roomAction(() => skipScrabbleTurn(
      roomState.session.id,
      roomState.session.scrabbleTurnNumber,
    ))
  }

  async function finishCurrentGame() {
    if (!roomState) return
    if (
      roomState.session.mode === 'scrabble'
      && roomState.session.scrabblePendingWord
      && !window.confirm(`${roomState.session.scrabblePendingWord} has not been scored. Finish the game and discard it?`)
    ) return
    await roomAction(() => finishRoomGame(roomState.session.id))
  }

  useEffect(() => {
    if (!isOnline || submissionMode !== 'queued' || !queuedSubmission || currentRound?.phase !== 'collecting') return
    void submitAnswers()
  }, [isOnline, submissionMode, queuedSubmission?.clientToken, currentRound?.phase])

  useEffect(() => {
    if (roomState?.session.boardSource !== 'generated' || currentRound?.phase !== 'playing') return
    if (countdownRemaining === 0 && timerRemaining === 0) {
      if (onlineSaveTimerRef.current !== null) {
        window.clearTimeout(onlineSaveTimerRef.current)
        onlineSaveTimerRef.current = null
      }
      setOnlineSyncState('locked')
      return
    }
    if (!me?.isPlayer || !isOnline || currentRound.timerPausedAt || countdownRemaining > 0 || !onlineDirtyRef.current) return
    if (onlineSyncState === 'saving') return
    enqueueOnlineSync(onlineWordsRef.current)
  }, [isOnline, onlineSyncState, roomState?.session.boardSource, currentRound?.phase, currentRound?.timerPausedAt, countdownRemaining, timerRemaining, me?.id])

  useEffect(() => {
    if (!isHost || !dictionary || roomState?.session.boardSource !== 'generated' || !currentRound) return
    if (currentRound.phase === 'processing') {
      void processRound('resume')
      return
    }
    if (currentRound.phase === 'playing' && !currentRound.timerPausedAt && countdownRemaining === 0 && timerRemaining === 0) {
      if (Date.now() < processingRetryAtRef.current) return
      void processRound('expired')
    }
  }, [isHost, Boolean(dictionary), roomState?.session.boardSource, currentRound?.id, currentRound?.phase, currentRound?.timerPausedAt, countdownRemaining, timerRemaining, now])

  const scoreboard = useMemo(() => {
    if (!roomState) return []
    return players.map((player, index) => {
      const scrabble = roomState.scoreEntries.filter((entry) => entry.memberId === player.id && !entry.voidedAt).reduce((sum, entry) => sum + entry.points, 0)
      const grid = roomState.results.filter((result) => {
        const word = roomState.words.find((item) => item.id === result.wordId)
        const submission = roomState.submissions.find((item) => item.id === word?.submissionId)
        const round = roomState.rounds.find((item) => item.id === result.roundId)
        return submission?.memberId === player.id && round?.phase === 'finalized'
      }).reduce((sum, result) => sum + result.score, 0)
      return { ...player, color: PLAYER_COLORS[index % PLAYER_COLORS.length], score: scrabble + grid }
    }).sort((left, right) => right.score - left.score)
  }, [roomState, players])

  return (
    <div className="app-shell room-app">
      <header className="site-header">
        <button className="brand brand-button" type="button" onClick={() => { if (!activeRoom) setLandingView('home') }} aria-label="Wordwell home">
          <span className="brand-mark" aria-hidden="true"><span>W</span><small>4</small></span>
          <span className="brand-name">Wordwell</span>
        </button>
        <div className="header-actions">
          <span className={`connection-pill ${isOnline ? '' : 'is-offline'}`}>
            {isOnline ? <Cloud size={15} /> : <WifiOff size={15} />}
            {isOnline ? (realtimeState === 'SUBSCRIBED' && activeRoom ? 'Live' : 'Online') : 'Offline draft'}
          </span>
          {installPrompt && <button className="install-button" type="button" onClick={installApp}><Download size={16} /> Install</button>}
        </div>
      </header>

      <main id="top">
        {!activeRoom ? (
          <Landing
            view={landingView}
            setView={setLandingView}
            createMode={createMode}
            setCreateMode={setCreateMode}
            boardSource={boardSource}
            setBoardSource={(source) => {
              setBoardSource(source)
              if (source === 'generated' && timerSeconds === 0) setTimerSeconds(180)
            }}
            playerLimit={playerLimit}
            setPlayerLimit={setPlayerLimit}
            hostPlaying={hostPlaying}
            setHostPlaying={setHostPlaying}
            hostName={hostName}
            setHostName={setHostName}
            gridSize={gridSize}
            setGridSize={resizeBoard}
            timerSeconds={timerSeconds}
            setTimerSeconds={setTimerSeconds}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            joinName={joinName}
            setJoinName={setJoinName}
            busy={busy}
            onCreate={handleCreateRoom}
            onJoin={handleJoinRoom}
            configured={isRoomsSupabaseConfigured}
            legacyCount={legacyHistory.length}
          />
        ) : !roomState ? (
          <section className="loading-room"><LoaderCircle className="spin" /><h1>Opening your table…</h1><p>Your room and private player identity are being restored.</p><button className="secondary-button" type="button" onClick={leaveRoom}>Return home</button></section>
        ) : (
          <>
            <RoomMasthead
              room={roomState}
              code={activeRoom.roomCode}
              me={me}
              onShare={copyRoomLink}
              onLeave={leaveRoom}
              compact={roomState.session.boardSource === 'generated' && currentRound?.phase === 'playing'}
            />
            <div className="room-layout">
              <div className="round-column">
                {roomState.session.status === 'complete' ? (
                  <FinalLeaderboard room={roomState} />
                ) : (
                  <>
                {!roomState.session.lobbyLocked && roomState.session.mode === 'scrabble' && (
                  <LobbyPanel room={roomState} me={me} isHost={isHost} busy={busy} onRemove={(id) => roomAction(() => removeRoomMember(id))} onStart={() => roomAction(() => startScrabbleRoom(roomState.session.id))} />
                )}

                {roomState.session.mode === 'scrabble' && roomState.session.lobbyLocked && (
                  <ScrabblePanel
                    dictionaryReady={Boolean(dictionary)}
                    turnPlayers={scrabbleTurnPlayers}
                    currentPlayer={currentScrabblePlayer}
                    turnNumber={roomState.session.scrabbleTurnNumber}
                    isMyTurn={isMyScrabbleTurn}
                    isHost={isHost}
                    isOnline={isOnline}
                    pendingWord={roomState.session.scrabblePendingWord}
                    definition={scrabbleDefinition}
                    definitionLoading={definitionLoading}
                    invalidNotice={scrabbleInvalidNotice}
                    word={scrabbleWord}
                    points={scrabblePoints}
                    busy={busy}
                    onWord={(value) => setScrabbleWord(value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    onPoints={setScrabblePoints}
                    onCheck={checkScrabbleWord}
                    onAward={awardScrabbleWord}
                    onPass={passCurrentScrabbleTurn}
                    onSkip={skipCurrentScrabbleTurn}
                  />
                )}

                {roomState.session.mode !== 'scrabble' && currentRound?.phase === 'board_setup' && (
                  roomState.session.boardSource === 'generated' ? (
                    isHost ? (
                      <LobbyPanel
                        room={roomState}
                        me={me}
                        isHost
                        busy={busy}
                        onRemove={(id) => roomAction(() => removeRoomMember(id))}
                        onStart={startOnlineRound}
                        startLabel={`Generate ${currentRound.gridSize}×${currentRound.gridSize} board & start`}
                      />
                    ) : <WaitingPanel icon={<Gamepad2 />} title="Waiting for the host to generate the board" copy="Keep this screen open. Everyone gets the same board after a synchronized three-second countdown." />
                  ) : isHost ? (
                    <>
                      <LobbyPanel room={roomState} me={me} isHost busy={busy} onRemove={(id) => roomAction(() => removeRoomMember(id))} />
                      <BoardEditor
                        size={gridSize}
                        cells={boardCells}
                        reviewCells={boardReviewCells}
                        scanning={ocrBusy}
                        onSizeChange={resizeBoard}
                        onCellChange={(index, value) => {
                          setBoardCells((cells) => cells.map((cell, cellIndex) => cellIndex === index ? value : cell))
                          setBoardReviewCells((cells) => cells.map((needsReview, cellIndex) => cellIndex === index ? false : needsReview))
                        }}
                        onScan={() => setCaptureKind('board')}
                        onConfirm={confirmBoardAndStart}
                      />
                    </>
                  ) : <WaitingPanel icon={<Camera />} title="The host is setting up the board" copy="Keep this screen open. The confirmed grid and timer will appear here for everyone." />
                )}

                {roomState.session.mode !== 'scrabble' && currentRound?.phase === 'playing' && (
                  roomState.session.boardSource === 'generated' ? (
                    <OnlineWordEntry
                      round={currentRound}
                      seconds={timerRemaining}
                      countdown={countdownRemaining}
                      words={onlineWords}
                      syncState={onlineSyncState}
                      isPlayer={Boolean(me?.isPlayer)}
                      isHost={isHost}
                      busy={busy}
                      onAdd={addOnlineWord}
                      onChange={changeOnlineWord}
                      onRemove={removeOnlineWord}
                      onPause={() => roomAction(() => pauseRoomRound(currentRound.id))}
                      onResume={() => roomAction(() => resumeRoomRound(currentRound.id))}
                      onEnd={endGeneratedRoundEarly}
                    />
                  ) : <LiveRoundPanel round={currentRound} seconds={timerRemaining} isHost={isHost} busy={busy} onPause={() => roomAction(() => pauseRoomRound(currentRound.id))} onResume={() => roomAction(() => resumeRoomRound(currentRound.id))} onCollect={() => roomAction(() => openRoundSubmissions(currentRound.id))} />
                )}

                {roomState.session.mode !== 'scrabble' && roomState.session.boardSource === 'physical' && currentRound?.phase === 'collecting' && (
                  <>
                    {me?.isPlayer && submissionMode !== 'submitted' ? (
                      <AnswerReview
                        words={answerRows.map((row) => ({ id: row.id, raw: row.rawText, normalized: row.normalized, confidence: row.confidence ?? undefined }))}
                        processing={ocrBusy}
                        submitting={busy}
                        onScan={() => setCaptureKind('answers')}
                        onChange={(id, value) => setAnswerRows((rows) => rows.map((row) => row.id === id ? updateAnswerDraftRow(row, value) : row))}
                        onAdd={() => setAnswerRows((rows) => [...rows, createAnswerDraftRow('', null, 'manual')])}
                        onRemove={(id) => setAnswerRows((rows) => rows.filter((row) => row.id !== id))}
                        onConfirm={submitAnswers}
                      />
                    ) : me?.isPlayer ? (
                      <WaitingPanel icon={<CheckCircle2 />} title={submissionMode === 'queued' ? 'Saved on this phone' : 'Your words are sealed'} copy={submissionMode === 'queued' ? 'Reconnect before the host closes so your list can be counted.' : 'Other players can only see that you are ready. Your words stay hidden until reveal.'} action={<button className="secondary-button" type="button" onClick={() => setSubmissionMode('draft')}><RotateCcw size={17} /> Edit submission</button>} />
                    ) : null}
                    {isHost && <ReadinessPanel room={roomState} round={currentRound} dictionaryReady={Boolean(dictionary)} busy={busy} onClose={closeAndReveal} />}
                  </>
                )}

                {roomState.session.mode !== 'scrabble' && currentRound?.phase === 'processing' && <WaitingPanel icon={<LoaderCircle className="spin" />} title="Preparing the reveal" copy="The round is locked while every list is checked against the dictionary and board." />}

                {roomState.session.mode !== 'scrabble' && currentRound?.phase === 'review' && (
                  <RevealPanel room={roomState} round={currentRound} isHost={isHost} onOverride={overrideResult} onFinalize={() => roomAction(() => finalizeRoomRound(currentRound.id))} />
                )}

                {roomState.session.mode !== 'scrabble' && currentRound?.phase === 'finalized' && (
                  <RoundCompletePanel room={roomState} round={currentRound} isHost={isHost} busy={busy} onNext={() => roomAction(() => createNextRound(roomState.session.id, currentRound.gridSize, currentRound.timerDurationSeconds))} onFinish={finishCurrentGame} />
                )}
                  </>
                )}
              </div>

              <aside className="room-sidebar">
                <Scoreboard scores={scoreboard} mode={roomState.session.mode} />
                <Roster room={roomState} me={me} currentRound={currentRound} presence={presence} />
                {roomState.session.mode === 'scrabble' && roomState.session.lobbyLocked && <ScrabbleHistory room={roomState} isHost={isHost} onVoid={(entryId) => { const reason = window.prompt('Why should this score be removed?'); if (reason?.trim()) void roomAction(() => voidScrabbleScore(entryId, reason.trim())) }} />}
                {isHost && roomState.session.mode === 'scrabble' && roomState.session.lobbyLocked && roomState.session.status === 'active' && <button className="finish-game-button" type="button" onClick={finishCurrentGame}><Flag size={17} /> Finish game</button>}
              </aside>
            </div>
          </>
        )}
      </main>

      <footer><p>Made for kitchen tables, rainy afternoons, and extremely serious rematches.</p><span>Wordwell v0.4</span></footer>

      {captureKind && <CameraCapture title={captureKind === 'board' ? 'Scan the letter board' : 'Scan your answer sheet'} instruction={captureKind === 'board' ? `Use the ${gridSize}×${gridSize} guide to align the full square board.` : 'Crop to the handwritten answers you want included.'} aspect={captureKind === 'board' ? 1 : undefined} gridSize={captureKind === 'board' ? gridSize : undefined} onCancel={() => setCaptureKind(null)} onConfirm={handleCapturedImage} />}
      {ocrBusy && <div className="ocr-status" role="status"><LoaderCircle className="spin" /><span><strong>Reading locally</strong><small>{ocrProgress}</small></span></div>}
      {busy && <div className="busy-bar" aria-hidden="true" />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} /> {toast}<button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={16} /></button></div>}
    </div>
  )
}

type LandingProps = {
  view: LandingView
  setView: (view: LandingView) => void
  createMode: RoomMode
  setCreateMode: (mode: RoomMode) => void
  boardSource: BoardSource
  setBoardSource: (source: BoardSource) => void
  playerLimit: number
  setPlayerLimit: (count: number) => void
  hostPlaying: boolean
  setHostPlaying: (playing: boolean) => void
  hostName: string
  setHostName: (name: string) => void
  gridSize: 4 | 5
  setGridSize: (size: 4 | 5) => void
  timerSeconds: number
  setTimerSeconds: (seconds: number) => void
  joinCode: string
  setJoinCode: (code: string) => void
  joinName: string
  setJoinName: (name: string) => void
  busy: boolean
  onCreate: () => void
  onJoin: () => void
  configured: boolean
  legacyCount: number
}

function Landing(props: LandingProps) {
  if (props.view === 'home') return (
    <>
      <section className="room-hero">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> Multiplayer word nights</p>
          <h1>Every phone.<br /><em>One table.</em></h1>
        </div>
        <div className="hero-copy">
          <p>Scan handwritten answers, verify every word, and reveal duplicates together—without passing one phone around.</p>
          <div className="home-actions">
            <button className="primary-button" type="button" onClick={() => props.setView('create')}><Plus size={19} /> Create a room</button>
            <button className="secondary-button" type="button" onClick={() => props.setView('join')}><Link2 size={18} /> Join with code</button>
          </div>
          {!props.configured && <p className="config-note"><CloudOff size={16} /> Add your Supabase publishable key to enable live rooms.</p>}
        </div>
      </section>
      <section className="feature-strip" aria-label="How Wordwell works">
        <article className="coral"><span>01</span><Camera /><h2>Scan locally</h2><p>Photos stay on the phone that took them.</p></article>
        <article className="mint"><span>02</span><LockKeyhole /><h2>Submit privately</h2><p>Only readiness is visible before reveal.</p></article>
        <article className="lilac"><span>03</span><Eye /><h2>Reveal together</h2><p>Matching answers cross out for everyone.</p></article>
      </section>
      <section className="offline-ribbon"><WifiOff /><div><strong>Offline-capable after install</strong><span>Dictionary, OCR, board checks, and answer drafts remain on-device.</span></div>{props.legacyCount > 0 && <small><History size={14} /> {props.legacyCount} earlier {props.legacyCount === 1 ? 'game' : 'games'} still saved</small>}</section>
    </>
  )

  if (props.view === 'join') return (
    <section className="single-form-wrap">
      <button className="back-button" type="button" onClick={() => props.setView('home')}><ArrowLeft size={17} /> Back</button>
      <div className="join-card">
        <p className="eyebrow"><Link2 size={16} /> Join instantly</p>
        <h1>Find your <em>table.</em></h1>
        <p>Ask the host for the six-character room code. Joining requires internet.</p>
        <label><span>Room code</span><input className="room-code-input" value={props.joinCode} onChange={(event) => props.setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="W7RDLY" autoCapitalize="characters" /></label>
        <label><span>Your player name</span><input value={props.joinName} onChange={(event) => props.setJoinName(event.target.value)} maxLength={30} placeholder="Mika" /></label>
        <button className="primary-button full-button" type="button" onClick={props.onJoin} disabled={props.busy}><ArrowRight size={18} /> {props.busy ? 'Joining…' : 'Join room'}</button>
      </div>
    </section>
  )

  return (
    <section className="single-form-wrap create-wrap">
      <button className="back-button" type="button" onClick={() => props.setView('home')}><ArrowLeft size={17} /> Back</button>
      <div className="create-card">
        <div className="create-heading"><div><p className="eyebrow"><Gamepad2 size={16} /> Host a new game</p><h1>Set the <em>rules.</em></h1></div><p>Players join from their own phones after you create the room.</p></div>
        <div className="setup-block"><span className="setup-number">01</span><div><h2>Choose the game</h2><div className="mode-picker setup-modes">{MODES.map((mode) => <button key={mode.id} className={`${mode.color} ${props.createMode === mode.id ? 'is-selected' : ''}`} type="button" onClick={() => { props.setCreateMode(mode.id); if (mode.id === 'scribbage' && props.boardSource === 'generated' && props.timerSeconds === 0) props.setTimerSeconds(180) }}><span>{mode.label}</span><small>{mode.short}</small>{props.createMode === mode.id && <Check size={17} />}</button>)}</div></div></div>
        <div className="setup-block"><span className="setup-number">02</span><div className="setup-grid"><label><span>Player limit</span><div className="player-counter"><button type="button" onClick={() => props.setPlayerLimit(Math.max(2, props.playerLimit - 1))}><Minus /></button><strong>{props.playerLimit}</strong><button type="button" onClick={() => props.setPlayerLimit(Math.min(6, props.playerLimit + 1))}><Plus /></button></div></label><label className="toggle-label"><span>Host is playing</span><input type="checkbox" checked={props.hostPlaying} onChange={(event) => props.setHostPlaying(event.target.checked)} /></label>{props.hostPlaying && <label><span>Your player name</span><input value={props.hostName} onChange={(event) => props.setHostName(event.target.value)} maxLength={30} /></label>}</div></div>
        {props.createMode === 'scribbage' && <div className="setup-block"><span className="setup-number">03</span><div><h2>Choose the board</h2><div className="board-source-picker"><button className={props.boardSource === 'generated' ? 'is-selected' : ''} type="button" onClick={() => props.setBoardSource('generated')}><Gamepad2 /><span><strong>Generated board</strong><small>Play the whole round online</small></span>{props.boardSource === 'generated' && <Check />}</button><button className={props.boardSource === 'physical' ? 'is-selected' : ''} type="button" onClick={() => props.setBoardSource('physical')}><Camera /><span><strong>Physical board</strong><small>Scan your real tile setup</small></span>{props.boardSource === 'physical' && <Check />}</button></div></div></div>}
        {props.createMode !== 'scrabble' && <div className="setup-block"><span className="setup-number">{props.createMode === 'scribbage' ? '04' : '03'}</span><div className="setup-grid"><label><span>Board size</span><select value={props.gridSize} onChange={(event) => props.setGridSize(Number(event.target.value) as 4 | 5)}><option value="4">4 × 4</option><option value="5">5 × 5</option></select></label><label><span>Round timer</span><select value={props.timerSeconds} onChange={(event) => props.setTimerSeconds(Number(event.target.value))}>{!(props.createMode === 'scribbage' && props.boardSource === 'generated') && <option value="0">No timer</option>}<option value="120">2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option></select></label></div></div>}
        <div className="create-action"><p><Users size={16} /> Up to {props.playerLimit} players · {modeLabel(props.createMode)}{props.createMode === 'scribbage' ? ` · ${props.boardSource === 'generated' ? 'Online board' : 'Physical board'}` : ''}</p><button className="primary-button" type="button" onClick={props.onCreate} disabled={props.busy}>{props.busy ? 'Creating…' : 'Create room'} <ArrowRight size={18} /></button></div>
      </div>
    </section>
  )
}

function RoomMasthead({ room, code, me, onShare, onLeave, compact = false }: { room: RoomState; code?: string; me: RoomMember | null; onShare: () => void; onLeave: () => void; compact?: boolean }) {
  return <section className={`room-masthead${compact ? ' is-compact' : ''}`}><div><p className="eyebrow"><Wifi size={16} /> Live room · {me?.isHost ? 'You are host' : `Playing as ${me?.displayName ?? 'guest'}`}</p><h1>{modeLabel(room.session.mode)}<br /><em>face-off.</em></h1></div><div className="room-code-card"><span>Room code</span><strong>{code ?? '••••••'}</strong><div><button type="button" onClick={onShare}><Copy size={16} /> Share</button><button type="button" onClick={onLeave}><X size={16} /> Leave</button></div></div></section>
}

function LobbyPanel({ room, me, isHost, busy, onRemove, onStart, startLabel = 'Start Scrabble game' }: { room: RoomState; me: RoomMember | null; isHost: boolean; busy: boolean; onRemove: (id: string) => void; onStart?: () => void; startLabel?: string }) {
  const players = room.members.filter((member) => member.isPlayer)
  return <section className="play-card lobby-card"><div className="card-heading"><div><p className="section-kicker">Live lobby</p><h2><Users size={22} /> {players.length} of {room.session.playerLimit} players joined</h2><p>{isHost ? 'Share the room code, then begin when everyone is here.' : 'You are in. Waiting for the host to begin.'}</p></div><span className="status-chip waiting">Open</span></div><ul className="lobby-list">{room.members.map((member, index) => <li key={member.id}><span className={`player-swatch ${PLAYER_COLORS[index % PLAYER_COLORS.length]}`}>{member.displayName.charAt(0).toUpperCase()}</span><span><strong>{member.displayName}{member.id === me?.id ? ' · You' : ''}</strong><small>{member.isHost ? 'Host' : 'Player'} · Joined</small></span>{member.isHost ? <Crown size={18} /> : isHost && <button type="button" onClick={() => onRemove(member.id)} aria-label={`Remove ${member.displayName}`}><UserMinus size={17} /></button>}</li>)}</ul>{onStart && isHost && <button className="primary-button full-button" type="button" onClick={onStart} disabled={busy || players.length < 2}><Play size={18} /> {startLabel}</button>}</section>
}

function LiveRoundPanel({ round, seconds, isHost, busy, onPause, onResume, onCollect }: { round: GameRound; seconds: number; isHost: boolean; busy: boolean; onPause: () => void; onResume: () => void; onCollect: () => void }) {
  return <section className="play-card live-round"><div className="live-round-top"><div><p className="section-kicker">Round {round.roundNumber} · Write on paper</p><h2>Find every word you can</h2></div><div className={`round-timer ${seconds <= 10 ? 'urgent' : ''}`} aria-label={`${seconds} seconds remaining`}><Clock3 /><strong>{round.timerDurationSeconds === 0 ? '∞' : formatTimer(seconds)}</strong><small>{round.timerPausedAt ? 'Paused' : 'Remaining'}</small></div></div><div className={`shared-board size-${round.gridSize}`}>{round.grid.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <span key={`${rowIndex}-${columnIndex}`}>{cell}<small>{rowIndex * round.gridSize + columnIndex + 1}</small></span>))}</div><p className="round-instruction">Letters may connect horizontally, vertically, or diagonally. A tile cannot be reused in the same word.</p>{isHost && <div className="host-controls"><button className="secondary-button" type="button" disabled={busy} onClick={round.timerPausedAt ? onResume : onPause}>{round.timerPausedAt ? <Play size={17} /> : <Pause size={17} />}{round.timerPausedAt ? 'Resume' : 'Pause'}</button><button className="primary-button" type="button" disabled={busy} onClick={onCollect}><ScanText size={18} /> Collect answers now</button></div>}</section>
}

function ReadinessPanel({ room, round, dictionaryReady, busy, onClose }: { room: RoomState; round: GameRound; dictionaryReady: boolean; busy: boolean; onClose: () => void }) {
  const players = room.members.filter((member) => member.isPlayer)
  const ready = players.filter((player) => room.submissions.some((submission) => submission.roundId === round.id && submission.memberId === player.id && submission.status === 'confirmed'))
  return <section className="play-card readiness-card"><div className="card-heading"><div><p className="section-kicker">Host controls</p><h2><LockKeyhole size={21} /> {ready.length} of {players.length} ready</h2><p>Lists stay private. Closing now counts anyone missing as an empty submission.</p></div><span className="status-chip ready">{ready.length}/{players.length}</span></div><div className="readiness-dots">{players.map((player) => { const done = ready.some((item) => item.id === player.id); return <span className={done ? 'done' : ''} key={player.id}>{done ? <Check /> : <Clock3 />}<small>{player.displayName}</small></span> })}</div><button className="primary-button full-button" type="button" onClick={onClose} disabled={busy || !dictionaryReady}><Eye size={18} /> {dictionaryReady ? 'Close round & reveal' : 'Opening dictionary…'}</button></section>
}

function WaitingPanel({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <section className="play-card waiting-panel"><span>{icon}</span><p className="section-kicker">Round status</p><h2>{title}</h2><p>{copy}</p>{action}</section>
}

function RevealPanel({ room, round, isHost, onOverride, onFinalize }: { room: RoomState; round: GameRound; isHost: boolean; onOverride: (result: RoundWordResult, check: 'dictionary' | 'grid_path') => void; onFinalize: () => void }) {
  return <section className="play-card reveal-card"><div className="card-heading"><div><p className="section-kicker">Round {round.roundNumber} reveal</p><h2><Eye size={22} /> The lists are open</h2><p>Exact matches are crossed out for every player and score zero.</p></div><span className="status-chip ready">Revealed</span></div><div className="reveal-columns">{room.members.filter((member) => member.isPlayer).map((member, index) => { const submission = room.submissions.find((item) => item.roundId === round.id && item.memberId === member.id); const words = room.words.filter((word) => word.submissionId === submission?.id); return <article key={member.id}><header><span className={`player-swatch ${PLAYER_COLORS[index % PLAYER_COLORS.length]}`}>{member.displayName.charAt(0)}</span><div><h3>{member.displayName}</h3><small>{words.reduce((sum, word) => sum + (room.results.find((result) => result.wordId === word.id)?.score ?? 0), 0)} points</small></div></header>{words.length === 0 ? <p className="empty-list">No submitted words</p> : <ul>{words.map((word) => { const result = room.results.find((item) => item.wordId === word.id); if (!result) return null; const invalid = !result.eligible; return <li className={invalid ? 'crossed' : 'accepted'} key={word.id}><span><strong>{word.normalized}</strong><small>{resultReason(result)}</small></span><b>{result.score ? `+${result.score}` : '0'}</b>{isHost && !result.dictionaryValid && !result.crossPlayerDuplicate && <button type="button" onClick={() => onOverride(result, 'dictionary')}>Accept dictionary</button>}{isHost && !result.gridValid && !result.crossPlayerDuplicate && <button type="button" onClick={() => onOverride(result, 'grid_path')}>Accept path</button>}</li>})}</ul>}</article> })}</div>{isHost ? <button className="primary-button full-button" type="button" onClick={onFinalize}><Trophy size={18} /> Finalize round scores</button> : <p className="waiting-copy">Waiting for the host to finalize this round.</p>}</section>
}

function RoundCompletePanel({ room, round, isHost, busy, onNext, onFinish }: { room: RoomState; round: GameRound; isHost: boolean; busy: boolean; onNext: () => void; onFinish: () => void }) {
  return <section className="play-card round-complete"><span className="trophy-orbit"><Trophy size={38} /></span><p className="section-kicker">Round {round.roundNumber} complete</p><h2>Scores are locked in.</h2><p>{isHost ? 'Set up another board or finish the game and crown the winner.' : 'The host will decide whether there is another round.'}</p>{isHost && <div><button className="primary-button" type="button" onClick={onNext} disabled={busy}><Plus size={18} /> Next round</button><button className="secondary-button" type="button" onClick={onFinish} disabled={busy}><Flag size={17} /> Finish game</button></div>}{room.session.status === 'complete' && <p>Game complete.</p>}</section>
}

type ScrabblePanelProps = {
  dictionaryReady: boolean
  turnPlayers: RoomMember[]
  currentPlayer: RoomMember | null
  turnNumber: number
  isMyTurn: boolean
  isHost: boolean
  isOnline: boolean
  pendingWord: string | null
  definition: WordDefinition | null
  definitionLoading: boolean
  invalidNotice: string | null
  word: string
  points: string
  busy: boolean
  onWord: (value: string) => void
  onPoints: (value: string) => void
  onCheck: () => void
  onAward: () => void
  onPass: () => void
  onSkip: () => void
}

function DefinitionCard({
  word,
  definition,
  loading,
}: {
  word: string
  definition: WordDefinition | null
  loading: boolean
}) {
  return (
    <div className="definition-card" aria-live="polite">
      <header>
        <span><BookOpen size={18} /></span>
        <div>
          <strong>{word}</strong>
          {definition?.phonetic && <small>{definition.phonetic}</small>}
        </div>
      </header>
      {loading ? (
        <p className="definition-state"><LoaderCircle className="spin" size={16} /> Looking up the meaning…</p>
      ) : definition ? (
        <div className="definition-meanings">
          {definition.meanings.map((meaning) => (
            <section key={meaning.partOfSpeech}>
              <b>{meaning.partOfSpeech}</b>
              <ol>{meaning.definitions.map((item) => <li key={item}>{item}</li>)}</ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="definition-state">Meaning unavailable. The SOWPODS result is still valid.</p>
      )}
    </div>
  )
}

function ScrabblePanel(props: ScrabblePanelProps) {
  const canCheck = props.isMyTurn
    && props.isOnline
    && !props.pendingWord
    && props.dictionaryReady
    && Boolean(props.word)
    && !props.busy

  return (
    <section className="play-card scrabble-panel">
      <div className="card-heading">
        <div>
          <p className="section-kicker">Turn {props.turnNumber}</p>
          <h2><Shuffle size={22} /> {props.currentPlayer?.displayName ?? 'Waiting for the turn order'}</h2>
          <p>{props.isMyTurn ? 'It is your turn.' : `${props.currentPlayer?.displayName ?? 'The next player'} has the checker.`} Valid words use offline SOWPODS.</p>
        </div>
        <span className={`status-chip ${props.isMyTurn ? 'ready' : 'waiting'}`}>{props.isMyTurn ? 'Your turn' : 'Waiting'}</span>
      </div>

      <div className="scrabble-turn-order">
        <span><ListOrdered size={17} /> Shuffled order</span>
        <ol>
          {props.turnPlayers.map((player, index) => (
            <li className={player.id === props.currentPlayer?.id ? 'is-current' : ''} key={player.id}>
              <b>{index + 1}</b>
              <span>{player.displayName}</span>
              {player.id === props.currentPlayer?.id && <small>Playing</small>}
            </li>
          ))}
        </ol>
      </div>

      {props.invalidNotice && (
        <div className="word-verdict invalid" role="status">
          <XCircle />
          <span><strong>Not accepted</strong><small>{props.invalidNotice}</small></span>
        </div>
      )}

      {props.pendingWord ? (
        <>
          <div className="word-verdict valid">
            <CheckCircle2 />
            <span>
              <strong>Valid SOWPODS word</strong>
              <small>{props.isMyTurn ? 'Enter the score shown on the board.' : `${props.currentPlayer?.displayName ?? 'The current player'} is entering the board score.`}</small>
            </span>
          </div>
          <DefinitionCard word={props.pendingWord} definition={props.definition} loading={props.definitionLoading} />
          {props.isMyTurn && (
            <div className="manual-score">
              <label><span>Board score</span><input type="number" min="1" inputMode="numeric" value={props.points} onChange={(event) => props.onPoints(event.target.value)} placeholder="0" /></label>
              <button className="primary-button" type="button" onClick={props.onAward} disabled={props.busy || !props.isOnline || Number(props.points) <= 0}><Send size={18} /> Add my score</button>
            </div>
          )}
        </>
      ) : props.isMyTurn ? (
        <>
          {!props.isOnline && <p className="scrabble-offline"><WifiOff size={17} /> Reconnect to check, score, or pass this shared turn.</p>}
          <div className="scrabble-entry">
            <label><span>Word played</span><input value={props.word} onChange={(event) => props.onWord(event.target.value)} placeholder="QUIZZED" autoCapitalize="characters" disabled={!props.isOnline || props.busy} /></label>
            <button className="secondary-button" type="button" onClick={props.onCheck} disabled={!canCheck}>{props.dictionaryReady ? 'Check word' : 'Opening dictionary…'}</button>
          </div>
          <div className="scrabble-turn-actions">
            <button className="secondary-button" type="button" onClick={props.onPass} disabled={props.busy || !props.isOnline}><SkipForward size={17} /> Pass turn</button>
          </div>
        </>
      ) : (
        <div className="scrabble-waiting">
          <Clock3 />
          <strong>Only {props.currentPlayer?.displayName ?? 'the current player'} can check a word.</strong>
          <small>The checker will unlock automatically when your turn arrives.</small>
        </div>
      )}

      {props.isHost && (!props.isMyTurn || Boolean(props.pendingWord)) && (
        <div className="scrabble-host-recovery">
          <span>Host recovery</span>
          <button className="secondary-button" type="button" onClick={props.onSkip} disabled={props.busy || !props.isOnline}><SkipForward size={17} /> Skip stalled turn</button>
        </div>
      )}
    </section>
  )
}

function FinalLeaderboard({ room }: { room: RoomState }) {
  const summary = buildGameSummary(room)
  const podium = summary.filter((player) => player.rank <= 3)
  const winners = summary.filter((player) => player.rank === 1)
  const playerIndex = new Map(
    room.members.filter((member) => member.isPlayer).map((member, index) => [member.id, index]),
  )
  const finalizedRounds = room.rounds.filter((round) => round.phase === 'finalized')

  const roundTotals = finalizedRounds.map((round) => {
    const totals = new Map(room.members.filter((member) => member.isPlayer).map((member) => [member.id, 0]))
    const wordsById = new Map(room.words.map((word) => [word.id, word]))
    const submissionsById = new Map(room.submissions.map((submission) => [submission.id, submission]))
    for (const result of room.results.filter((item) => item.roundId === round.id && item.eligible && item.score > 0)) {
      const word = wordsById.get(result.wordId)
      const submission = word ? submissionsById.get(word.submissionId) : null
      if (submission && totals.has(submission.memberId)) {
        totals.set(submission.memberId, (totals.get(submission.memberId) ?? 0) + result.score)
      }
    }
    return { round, totals }
  })

  return (
    <section className="play-card final-leaderboard">
      <div className="winner-banner">
        <span className="winner-medal"><Trophy size={34} /></span>
        <p className="section-kicker">Game complete</p>
        <h2>{winners.length > 1 ? 'Shared victory!' : `${winners[0]?.displayName ?? 'Game'} wins!`}</h2>
        {winners.length > 1 && <p>{winners.map((winner) => winner.displayName).join(' & ')} tie for first.</p>}
        {winners.length === 1 && <p>Top of the table with {winners[0].totalPoints} points.</p>}
      </div>

      <div className="final-podium" aria-label="Top finishers">
        {podium.map((player) => (
          <article className={`podium-place rank-${player.rank}`} key={player.memberId}>
            <span className={`player-swatch ${PLAYER_COLORS[(playerIndex.get(player.memberId) ?? 0) % PLAYER_COLORS.length]}`}>{player.rank}</span>
            <Medal size={20} />
            <strong>{player.displayName}</strong>
            <b>{player.totalPoints}<small> pts</small></b>
          </article>
        ))}
      </div>

      <div className="final-ranking">
        <div className="history-title-row"><div><p className="section-kicker">Final standings</p><h3>Leaderboard</h3></div></div>
        <ol>
          {summary.map((player) => (
            <li key={player.memberId}>
              <span className="final-rank">{player.rank}</span>
              <span className="final-player">
                <strong>{player.displayName}</strong>
                <small>{player.scoredWordCount} scoring {player.scoredWordCount === 1 ? 'word' : 'words'}</small>
              </span>
              <span className="final-best">
                <small>Best play</small>
                <strong>{player.bestScore === null ? '—' : `${player.bestWords.join(', ')} · ${player.bestScore}`}</strong>
              </span>
              <b>{player.totalPoints}<small> pts</small></b>
            </li>
          ))}
        </ol>
      </div>

      {room.session.mode !== 'scrabble' && roundTotals.length > 0 && (
        <div className="final-round-history">
          <div className="history-title-row"><div><p className="section-kicker">Score audit</p><h3>Round history</h3></div></div>
          <div>
            {roundTotals.map(({ round, totals }) => (
              <article key={round.id}>
                <strong>Round {round.roundNumber}</strong>
                <ul>
                  {summary.map((player) => <li key={player.memberId}><span>{player.displayName}</span><b>{totals.get(player.memberId) ?? 0} pts</b></li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Scoreboard({ scores, mode }: { scores: Array<RoomMember & { color: string; score: number }>; mode: RoomMode }) {
  return <section className="scoreboard-card"><div className="scoreboard-heading"><div><p className="section-kicker">Live table</p><h2><Trophy size={21} /> Scoreboard</h2></div><span>{modeLabel(mode)}</span></div><ol className="player-scores">{scores.map((player, index) => <li key={player.id}><div className="score-row"><span className={`player-swatch ${player.color}`}>{index + 1}</span><span className="player-score-name"><strong>{player.displayName}</strong><small>{index === 0 ? 'Leading' : 'In the game'}</small></span><b>{player.score}<small>pts</small></b></div></li>)}</ol></section>
}

function Roster({ room, me, currentRound, presence }: { room: RoomState; me: RoomMember | null; currentRound: GameRound | null; presence: RoomPresence[] }) {
  return <section className="roster-card"><div className="history-title-row"><div><p className="section-kicker">Around the table</p><h2><Users size={20} /> Players</h2></div></div><ul>{room.members.map((member) => { const revealReady = currentRound && ['collecting', 'review', 'finalized'].includes(currentRound.phase); const ready = revealReady && room.submissions.some((submission) => submission.roundId === currentRound.id && submission.memberId === member.id && submission.status === 'confirmed'); const online = member.id === me?.id || presence.some((item) => item.userId === member.userId); return <li key={member.id}><span className={`presence-dot ${online ? '' : 'is-offline'}`} /><span><strong>{member.displayName}{member.id === me?.id ? ' · You' : ''}</strong><small>{member.isHost ? `Host · ${online ? 'Online' : 'Offline'}` : ready ? 'Ready' : online ? 'Connected' : 'Offline'}</small></span>{ready && <Check size={17} />}</li>})}</ul></section>
}

function ScrabbleHistory({ room, isHost, onVoid }: { room: RoomState; isHost: boolean; onVoid: (entryId: string) => void }) {
  return <section className="plays-card"><div className="history-title-row"><div><p className="section-kicker">Score ledger</p><h2><History size={20} /> Recent plays</h2></div></div>{room.scoreEntries.filter((entry) => !entry.voidedAt).length === 0 ? <p className="empty-ledger">Checked words will appear here.</p> : <ol className="plays-list">{[...room.scoreEntries].filter((entry) => !entry.voidedAt).reverse().slice(0, 10).map((entry) => <li key={entry.id}><span><strong>{entry.word}</strong><small>{room.members.find((member) => member.id === entry.memberId)?.displayName}</small></span><b>+{entry.points}</b>{isHost && <button type="button" onClick={() => onVoid(entry.id)} aria-label={`Remove ${entry.word}`}><X size={15} /></button>}</li>)}</ol>}</section>
}

export default App
