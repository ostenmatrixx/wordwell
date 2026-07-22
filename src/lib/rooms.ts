import {
  createClient,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'

export type RoomMode = 'scrabble' | 'boggle' | 'scribbage'
export type RoundPhase =
  | 'board_setup'
  | 'playing'
  | 'collecting'
  | 'processing'
  | 'review'
  | 'finalized'

export type RoomSession = {
  id: string
  mode: RoomMode
  playerLimit: number
  lobbyLocked: boolean
  status: 'active' | 'complete'
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export type RoomMember = {
  id: string
  sessionId: string
  userId: string
  displayName: string
  isHost: boolean
  isPlayer: boolean
  sortOrder: number
  joinedAt: string
  removedAt: string | null
}

export type GameRound = {
  id: string
  sessionId: string
  roundNumber: number
  gridSize: 4 | 5
  grid: string[][]
  phase: RoundPhase
  timerDurationSeconds: number
  timerRemainingSeconds: number
  timerStartedAt: string | null
  timerPausedAt: string | null
  frozenRevision: string | null
  resultsRevision: string | null
  createdAt: string
  startedAt: string | null
  closedAt: string | null
  finalizedAt: string | null
}

export type RoundSubmission = {
  id: string
  roundId: string
  memberId: string
  clientToken: string
  revision: number
  status: 'confirmed' | 'missing'
  confirmedAt: string | null
  updatedAt: string
}

export type SubmittedWord = {
  id: string
  submissionId: string
  position: number
  rawText: string
  normalized: string
  confidence: number | null
}

export type WordOverride = {
  id: string
  resultId: string
  checkType: 'dictionary' | 'grid_path'
  reason: string
  hostMemberId: string
  createdAt: string
}

export type RoundWordResult = {
  id: string
  roundId: string
  wordId: string
  resultsRevision: string
  formatValid: boolean
  minimumLengthValid: boolean
  dictionaryValid: boolean
  gridValid: boolean
  selfDuplicate: boolean
  crossPlayerDuplicate: boolean
  gridPath: Array<{ row: number; column: number }> | null
  baseScore: number
  score: number
  eligible: boolean
}

export type ScrabbleScoreEntry = {
  id: string
  sessionId: string
  memberId: string
  word: string
  points: number
  createdAt: string
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
}

export type RoomState = {
  session: RoomSession
  members: RoomMember[]
  rounds: GameRound[]
  submissions: RoundSubmission[]
  words: SubmittedWord[]
  results: RoundWordResult[]
  overrides: WordOverride[]
  scoreEntries: ScrabbleScoreEntry[]
}

export type CreateRoomOptions = {
  mode: RoomMode
  playerLimit: number
  hostPlayerName?: string | null
  gridSize?: 4 | 5
  timerSeconds?: number
}

export type RoomJoin = {
  sessionId: string
  memberId: string
  roomCode?: string
  roundId?: string | null
  isHost: boolean
}

export type SubmissionWordInput = {
  id: string
  rawText: string
  normalized?: string
  confidence?: number | null
}

export type RoundResultInput = {
  wordId: string
  formatValid: boolean
  minimumLengthValid: boolean
  dictionaryValid: boolean
  gridValid: boolean
  selfDuplicate: boolean
  crossPlayerDuplicate: boolean
  gridPath?: Array<{ row: number; column: number }> | null
  baseScore: number
  score: number
  eligible: boolean
}

export type FrozenRoundSnapshot = {
  round: Record<string, unknown>
  submissions: Array<{
    submissionId: string
    memberId: string
    playerName: string
    status: 'confirmed' | 'missing'
    words: Array<{
      id: string
      rawText: string
      normalized: string
      confidence: number | null
      position: number
    }>
  }>
}

export type RoomRealtimeEvent = {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  newRecord: Record<string, unknown>
  oldRecord: Record<string, unknown>
}

export type RoomPresence = {
  userId: string
  onlineAt: string
}

type JsonRecord = Record<string, unknown>

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isRoomsSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const roomsClient = isRoomsSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The room server returned an invalid response.')
  }
  return value as JsonRecord
}

function stringValue(record: JsonRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') throw new Error(`Room response is missing ${key}.`)
  return value
}

function nullableString(record: JsonRecord, key: string): string | null {
  return typeof record[key] === 'string' ? record[key] : null
}

function numberValue(record: JsonRecord, key: string): number {
  const value = record[key]
  if (typeof value !== 'number') throw new Error(`Room response is missing ${key}.`)
  return value
}

function booleanValue(record: JsonRecord, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') throw new Error(`Room response is missing ${key}.`)
  return value
}

function mapSession(value: unknown): RoomSession {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    mode: stringValue(row, 'mode') as RoomMode,
    playerLimit: numberValue(row, 'player_limit'),
    lobbyLocked: booleanValue(row, 'lobby_locked'),
    status: stringValue(row, 'status') as RoomSession['status'],
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
    finishedAt: nullableString(row, 'finished_at'),
  }
}

function mapMember(value: unknown): RoomMember {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    sessionId: stringValue(row, 'session_id'),
    userId: stringValue(row, 'user_id'),
    displayName: stringValue(row, 'display_name'),
    isHost: booleanValue(row, 'is_host'),
    isPlayer: booleanValue(row, 'is_player'),
    sortOrder: numberValue(row, 'sort_order'),
    joinedAt: stringValue(row, 'joined_at'),
    removedAt: nullableString(row, 'removed_at'),
  }
}

function mapRound(value: unknown): GameRound {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    sessionId: stringValue(row, 'session_id'),
    roundNumber: numberValue(row, 'round_number'),
    gridSize: numberValue(row, 'grid_size') as 4 | 5,
    grid: Array.isArray(row.grid) ? (row.grid as string[][]) : [],
    phase: stringValue(row, 'phase') as RoundPhase,
    timerDurationSeconds: numberValue(row, 'timer_duration_seconds'),
    timerRemainingSeconds: numberValue(row, 'timer_remaining_seconds'),
    timerStartedAt: nullableString(row, 'timer_started_at'),
    timerPausedAt: nullableString(row, 'timer_paused_at'),
    frozenRevision: nullableString(row, 'frozen_revision'),
    resultsRevision: nullableString(row, 'results_revision'),
    createdAt: stringValue(row, 'created_at'),
    startedAt: nullableString(row, 'started_at'),
    closedAt: nullableString(row, 'closed_at'),
    finalizedAt: nullableString(row, 'finalized_at'),
  }
}

function mapSubmission(value: unknown): RoundSubmission {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    roundId: stringValue(row, 'round_id'),
    memberId: stringValue(row, 'member_id'),
    clientToken: stringValue(row, 'client_token'),
    revision: numberValue(row, 'revision'),
    status: stringValue(row, 'status') as RoundSubmission['status'],
    confirmedAt: nullableString(row, 'confirmed_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapWord(value: unknown): SubmittedWord {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    submissionId: stringValue(row, 'submission_id'),
    position: numberValue(row, 'position'),
    rawText: stringValue(row, 'raw_text'),
    normalized: stringValue(row, 'normalized'),
    confidence: typeof row.ocr_confidence === 'number' ? row.ocr_confidence : null,
  }
}

function mapResult(value: unknown): RoundWordResult {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    roundId: stringValue(row, 'round_id'),
    wordId: stringValue(row, 'submitted_word_id'),
    resultsRevision: stringValue(row, 'results_revision'),
    formatValid: booleanValue(row, 'format_valid'),
    minimumLengthValid: booleanValue(row, 'minimum_length_valid'),
    dictionaryValid: booleanValue(row, 'dictionary_valid'),
    gridValid: booleanValue(row, 'grid_valid'),
    selfDuplicate: booleanValue(row, 'self_duplicate'),
    crossPlayerDuplicate: booleanValue(row, 'cross_player_duplicate'),
    gridPath: Array.isArray(row.grid_path) ? (row.grid_path as RoundWordResult['gridPath']) : null,
    baseScore: numberValue(row, 'base_score'),
    score: numberValue(row, 'score'),
    eligible: booleanValue(row, 'is_eligible'),
  }
}

function mapOverride(value: unknown): WordOverride {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    resultId: stringValue(row, 'round_word_result_id'),
    checkType: stringValue(row, 'check_type') as WordOverride['checkType'],
    reason: stringValue(row, 'reason'),
    hostMemberId: stringValue(row, 'host_member_id'),
    createdAt: stringValue(row, 'created_at'),
  }
}

function mapScoreEntry(value: unknown): ScrabbleScoreEntry {
  const row = asRecord(value)
  return {
    id: stringValue(row, 'id'),
    sessionId: stringValue(row, 'session_id'),
    memberId: stringValue(row, 'member_id'),
    word: stringValue(row, 'word'),
    points: numberValue(row, 'points'),
    createdAt: stringValue(row, 'created_at'),
    voidedAt: nullableString(row, 'voided_at'),
    voidedBy: nullableString(row, 'voided_by'),
    voidReason: nullableString(row, 'void_reason'),
  }
}

async function rpc<T>(name: string, parameters: JsonRecord): Promise<T | null> {
  if (!roomsClient) return null
  await ensureRoomAuth()
  const { data, error } = await roomsClient.rpc(name, parameters)
  if (error) throw error
  return data as T
}

export async function ensureRoomAuth(): Promise<string | null> {
  if (!roomsClient) return null
  const { data: sessionData, error: sessionError } = await roomsClient.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session?.user.id) return sessionData.session.user.id
  const { data, error } = await roomsClient.auth.signInAnonymously()
  if (error) throw error
  return data.user?.id ?? null
}

export async function createRoom(options: CreateRoomOptions): Promise<RoomJoin | null> {
  const data = await rpc<unknown>('create_room', {
    p_mode: options.mode,
    p_player_limit: options.playerLimit,
    p_host_player_name: options.hostPlayerName?.trim() || null,
    p_grid_size: options.gridSize ?? 4,
    p_timer_seconds: options.timerSeconds ?? 180,
  })
  if (!data) return null
  const result = asRecord(data)
  return {
    sessionId: stringValue(result, 'sessionId'),
    memberId: stringValue(result, 'memberId'),
    roomCode: stringValue(result, 'roomCode'),
    roundId: nullableString(result, 'roundId'),
    isHost: booleanValue(result, 'isHost'),
  }
}

export async function joinRoom(roomCode: string, playerName: string): Promise<RoomJoin | null> {
  const data = await rpc<unknown>('join_room', {
    p_room_code: roomCode,
    p_player_name: playerName,
  })
  if (!data) return null
  const result = asRecord(data)
  return {
    sessionId: stringValue(result, 'sessionId'),
    memberId: stringValue(result, 'memberId'),
    isHost: booleanValue(result, 'isHost'),
  }
}

export async function fetchRoomState(sessionId: string): Promise<RoomState | null> {
  if (!roomsClient) return null
  await ensureRoomAuth()
  const sessionQuery = roomsClient
    .from('game_sessions')
    .select('id,mode,player_limit,lobby_locked,status,created_at,updated_at,finished_at')
    .eq('id', sessionId)
    .single()
  const membersQuery = roomsClient.from('game_members').select('*').eq('session_id', sessionId).is('removed_at', null).order('sort_order')
  const roundsQuery = roomsClient.from('game_rounds').select('*').eq('session_id', sessionId).order('round_number')
  const scoresQuery = roomsClient.from('score_entries').select('*').eq('session_id', sessionId).order('created_at')
  const [sessionResponse, membersResponse, roundsResponse, scoresResponse] = await Promise.all([
    sessionQuery,
    membersQuery,
    roundsQuery,
    scoresQuery,
  ])
  for (const response of [sessionResponse, membersResponse, roundsResponse, scoresResponse]) {
    if (response.error) throw response.error
  }

  const rounds = (roundsResponse.data ?? []).map(mapRound)
  const roundIds = rounds.map((round) => round.id)
  let submissions: RoundSubmission[] = []
  let words: SubmittedWord[] = []
  let results: RoundWordResult[] = []
  let overrides: WordOverride[] = []
  if (roundIds.length > 0) {
    const [submissionsResponse, resultsResponse] = await Promise.all([
      roomsClient.from('round_submissions').select('*').in('round_id', roundIds),
      roomsClient.from('round_word_results').select('*').in('round_id', roundIds),
    ])
    if (submissionsResponse.error) throw submissionsResponse.error
    if (resultsResponse.error) throw resultsResponse.error
    submissions = (submissionsResponse.data ?? []).map(mapSubmission)
    results = (resultsResponse.data ?? []).map(mapResult)
    const submissionIds = submissions.map((submission) => submission.id)
    const resultIds = results.map((result) => result.id)
    const [wordsResponse, overridesResponse] = await Promise.all([
      submissionIds.length
        ? roomsClient.from('submitted_words').select('*').in('submission_id', submissionIds).order('position')
        : Promise.resolve({ data: [], error: null }),
      resultIds.length
        ? roomsClient.from('word_overrides').select('*').in('round_word_result_id', resultIds).order('created_at')
        : Promise.resolve({ data: [], error: null }),
    ])
    if (wordsResponse.error) throw wordsResponse.error
    if (overridesResponse.error) throw overridesResponse.error
    words = (wordsResponse.data ?? []).map(mapWord)
    overrides = (overridesResponse.data ?? []).map(mapOverride)
  }

  return {
    session: mapSession(sessionResponse.data),
    members: (membersResponse.data ?? []).map(mapMember),
    rounds,
    submissions,
    words,
    results,
    overrides,
    scoreEntries: (scoresResponse.data ?? []).map(mapScoreEntry),
  }
}

export const removeRoomMember = (memberId: string) => rpc<void>('remove_member', { p_member_id: memberId })
export const confirmRoundBoard = (roundId: string, grid: string[][]) =>
  rpc<unknown>('confirm_board', { p_round_id: roundId, p_grid: grid }).then((row) => (row ? mapRound(row) : null))
export const startRoomRound = (roundId: string) =>
  rpc<unknown>('start_round', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const pauseRoomRound = (roundId: string) =>
  rpc<unknown>('pause_round', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const resumeRoomRound = (roundId: string) =>
  rpc<unknown>('resume_round', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const resetRoomRoundTimer = (roundId: string) =>
  rpc<unknown>('reset_round_timer', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const openRoundSubmissions = (roundId: string) =>
  rpc<unknown>('open_submissions', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const startScrabbleRoom = (sessionId: string) =>
  rpc<unknown>('start_scrabble_game', { p_session_id: sessionId }).then((row) => (row ? mapSession(row) : null))

export function createNextRound(sessionId: string, gridSize: 4 | 5 = 4, timerSeconds = 180) {
  return rpc<unknown>('create_next_round', {
    p_session_id: sessionId,
    p_grid_size: gridSize,
    p_timer_seconds: timerSeconds,
  }).then((row) => (row ? mapRound(row) : null))
}

export function confirmRoundSubmission(
  roundId: string,
  clientToken: string,
  revision: number,
  words: SubmissionWordInput[],
) {
  return rpc<unknown>('confirm_submission', {
    p_round_id: roundId,
    p_client_token: clientToken,
    p_revision: revision,
    p_words: words,
  }).then((row) => (row ? mapSubmission(row) : null))
}

export async function closeRoomRound(roundId: string): Promise<{ roundId: string; frozenRevision: string } | null> {
  const data = await rpc<unknown>('close_round', { p_round_id: roundId })
  if (!data) return null
  const result = asRecord(data)
  return { roundId: stringValue(result, 'roundId'), frozenRevision: stringValue(result, 'frozenRevision') }
}

export function getFrozenRoundSnapshot(roundId: string) {
  return rpc<FrozenRoundSnapshot>('get_frozen_round_snapshot', { p_round_id: roundId })
}

export function publishRoundResults(roundId: string, frozenRevision: string, results: RoundResultInput[]) {
  return rpc<string>('publish_round_results', {
    p_round_id: roundId,
    p_frozen_revision: frozenRevision,
    p_results: results,
  })
}

export function applyWordOverride(resultId: string, checkType: WordOverride['checkType'], reason: string) {
  return rpc<unknown>('apply_word_override', {
    p_result_id: resultId,
    p_check_type: checkType,
    p_reason: reason,
  }).then((row) => (row ? mapResult(row) : null))
}

export const finalizeRoomRound = (roundId: string) =>
  rpc<unknown>('finalize_round', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))
export const reopenLatestRound = (roundId: string) =>
  rpc<unknown>('reopen_latest_round', { p_round_id: roundId }).then((row) => (row ? mapRound(row) : null))

export function submitScrabbleScore(sessionId: string, entryId: string, word: string, points: number) {
  return rpc<unknown>('submit_scrabble_entry', {
    p_session_id: sessionId,
    p_client_entry_id: entryId,
    p_word: word,
    p_points: points,
  }).then((row) => (row ? mapScoreEntry(row) : null))
}

export function voidScrabbleScore(entryId: string, reason: string) {
  return rpc<unknown>('void_scrabble_entry', { p_entry_id: entryId, p_reason: reason })
    .then((row) => (row ? mapScoreEntry(row) : null))
}

export const finishRoomGame = (sessionId: string) => rpc<unknown>('finish_game', { p_session_id: sessionId })

function listenForTable(
  channel: RealtimeChannel,
  table: string,
  filter: string,
  listener: (event: RoomRealtimeEvent) => void,
) {
  return channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table, filter },
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => listener({
      table,
      eventType: payload.eventType,
      newRecord: payload.new,
      oldRecord: payload.old,
    }),
  )
}

function subscribe(
  channel: RealtimeChannel,
  onStatus?: (status: string) => void,
): () => void {
  channel.subscribe(async (status) => {
    onStatus?.(status)
    if (status === 'SUBSCRIBED') {
      const userId = await ensureRoomAuth()
      if (userId) await channel.track({ userId, onlineAt: new Date().toISOString() })
    }
  })
  return () => {
    if (roomsClient) void roomsClient.removeChannel(channel)
  }
}

export function subscribeToRoom(
  sessionId: string,
  listener: (event: RoomRealtimeEvent) => void,
  onStatus?: (status: string) => void,
  onPresence?: (players: RoomPresence[]) => void,
): () => void {
  if (!roomsClient) return () => undefined
  let channel = roomsClient.channel(`room:${sessionId}`)
  channel = listenForTable(channel, 'game_sessions', `id=eq.${sessionId}`, listener)
  for (const table of ['game_members', 'game_rounds', 'score_entries']) {
    channel = listenForTable(channel, table, `session_id=eq.${sessionId}`, listener)
  }
  if (onPresence) {
    channel = channel.on('presence', { event: 'sync' }, () => {
      const players = Object.values(channel.presenceState()).flatMap((entries) =>
        entries.flatMap((entry) => {
          const presence = entry as unknown as JsonRecord
          const userId = typeof presence.userId === 'string' ? presence.userId : null
          const onlineAt = typeof presence.onlineAt === 'string' ? presence.onlineAt : null
          return userId && onlineAt ? [{ userId, onlineAt }] : []
        }),
      )
      onPresence(players)
    })
  }
  return subscribe(channel, onStatus)
}

export function subscribeToRound(
  roundId: string,
  listener: (event: RoomRealtimeEvent) => void,
  onStatus?: (status: string) => void,
): () => void {
  if (!roomsClient) return () => undefined
  let channel = roomsClient.channel(`round:${roundId}`)
  for (const table of ['round_submissions', 'round_word_results']) {
    channel = listenForTable(channel, table, `round_id=eq.${roundId}`, listener)
  }
  return subscribe(channel, onStatus)
}
