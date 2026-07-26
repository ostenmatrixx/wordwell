import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Check,
  Clock3,
  CloudOff,
  Flag,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import type { GameRound } from '../lib/rooms'

export type OnlineWordSyncState = 'not-submitted' | 'saving' | 'saved' | 'offline' | 'locked'

export type OnlineWord = {
  id: string
  value: string
}

type Props = {
  round: GameRound
  seconds: number
  countdown: number
  words: OnlineWord[]
  syncState: OnlineWordSyncState
  isPlayer: boolean
  isHost: boolean
  busy: boolean
  onAdd: (word: string) => void
  onChange: (id: string, word: string) => void
  onRemove: (id: string) => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function syncCopy(state: OnlineWordSyncState) {
  if (state === 'saving') return { icon: <LoaderCircle className="spin" />, label: 'Saving privately' }
  if (state === 'saved') return { icon: <Check />, label: 'Saved privately' }
  if (state === 'offline') return { icon: <CloudOff />, label: 'Offline · not submitted' }
  if (state === 'locked') return { icon: <LockKeyhole />, label: 'List locked' }
  return { icon: <CloudOff />, label: 'Not submitted yet' }
}

type EntryViewport = {
  height: number
  offsetLeft: number
  offsetTop: number
  width: number
}

function readEntryViewport(): EntryViewport {
  const viewport = window.visualViewport
  return {
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetLeft: Math.round(viewport?.offsetLeft ?? 0),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
    width: Math.round(viewport?.width ?? window.innerWidth),
  }
}

function isMobileEntryViewport() {
  return window.matchMedia('(max-width: 760px)').matches
}

export function OnlineWordEntry({
  round,
  seconds,
  countdown,
  words,
  syncState,
  isPlayer,
  isHost,
  busy,
  onAdd,
  onChange,
  onRemove,
  onPause,
  onResume,
  onEnd,
}: Props) {
  const [draft, setDraft] = useState('')
  const [entryFocused, setEntryFocused] = useState(false)
  const [entryViewport, setEntryViewport] = useState<EntryViewport | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollPositionRef = useRef(0)
  const paused = Boolean(round.timerPausedAt)
  const ended = seconds <= 0 && countdown <= 0
  const active = countdown <= 0 && !paused && !ended
  const status = syncCopy(ended ? 'locked' : syncState)
  const entryStyle = entryFocused && entryViewport ? {
    '--online-visual-height': `${entryViewport.height}px`,
    '--online-visual-left': `${entryViewport.offsetLeft}px`,
    '--online-visual-top': `${entryViewport.offsetTop}px`,
    '--online-visual-width': `${entryViewport.width}px`,
  } as CSSProperties : undefined

  useLayoutEffect(() => {
    if (!entryFocused) return

    const bodyStyle = document.body.style
    const previousBodyStyle = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width,
    }
    const scrollPosition = scrollPositionRef.current

    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${scrollPosition}px`
    bodyStyle.right = '0'
    bodyStyle.left = '0'
    bodyStyle.width = '100%'
    bodyStyle.overflow = 'hidden'

    return () => {
      bodyStyle.position = previousBodyStyle.position
      bodyStyle.top = previousBodyStyle.top
      bodyStyle.right = previousBodyStyle.right
      bodyStyle.left = previousBodyStyle.left
      bodyStyle.width = previousBodyStyle.width
      bodyStyle.overflow = previousBodyStyle.overflow
      window.scrollTo({ top: scrollPosition, left: 0, behavior: 'instant' })
    }
  }, [entryFocused])

  useEffect(() => {
    if (!entryFocused) return

    const viewport = window.visualViewport
    let frame = 0
    const updateViewport = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (!isMobileEntryViewport()) {
          inputRef.current?.blur()
          setEntryFocused(false)
          return
        }
        const next = readEntryViewport()
        setEntryViewport((current) => (
          current
          && current.height === next.height
          && current.offsetLeft === next.offsetLeft
          && current.offsetTop === next.offsetTop
          && current.width === next.width
            ? current
            : next
        ))
      })
    }

    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [entryFocused])

  useEffect(() => {
    if (active) return
    inputRef.current?.blur()
    setEntryFocused(false)
  }, [active])

  function openEntryMode() {
    if (!active || !isMobileEntryViewport()) return
    if (!entryFocused) scrollPositionRef.current = window.scrollY
    setEntryViewport(readEntryViewport())
    setEntryFocused(true)
  }

  function handleEntryPointerDown(event: ReactPointerEvent<HTMLInputElement>) {
    if (!active || !isMobileEntryViewport() || event.button !== 0) return

    // Mobile browsers normally scroll a focused field into view before React
    // can pin the play surface. Focus it ourselves without moving the page.
    event.preventDefault()
    openEntryMode()
    inputRef.current?.focus({ preventScroll: true })
  }

  function closeEntryMode() {
    window.setTimeout(() => {
      if (document.activeElement !== inputRef.current) setEntryFocused(false)
    }, 0)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = draft.trim().toUpperCase().replace(/[^A-Z]/g, '')
    if (!normalized || !active) return
    onAdd(normalized)
    setDraft('')
    if (entryFocused) {
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    }
  }

  return (
    <section
      className={`play-card online-round${entryFocused ? ' is-entry-focused' : ''}`}
      aria-labelledby="online-round-title"
      style={entryStyle}
    >
      <div className="online-round-heading">
        <div>
          <p className="section-kicker">Round {round.roundNumber} · Generated board</p>
          <h2 id="online-round-title">Find it. Type it. Keep moving.</h2>
          <p>Answers stay private until the timer ends and every list is checked together.</p>
        </div>
        <div className={`round-timer ${seconds <= 10 && countdown === 0 ? 'urgent' : ''}`} aria-label={countdown > 0 ? `${countdown} seconds until the round starts` : `${seconds} seconds remaining`}>
          <Clock3 />
          <strong>{countdown > 0 ? countdown : formatTimer(seconds)}</strong>
          <small>{countdown > 0 ? 'Get ready' : paused ? 'Paused' : ended ? 'Time' : 'Remaining'}</small>
        </div>
      </div>

      <div className="online-board-wrap">
        <div className={`shared-board online-shared-board size-${round.gridSize}${active ? '' : ' is-covered'}`} aria-label={`${round.gridSize} by ${round.gridSize} generated letter board`}>
          {round.grid.flatMap((row, rowIndex) => row.map((cell, columnIndex) => (
            <span key={`${rowIndex}-${columnIndex}`}>{cell}<small>{rowIndex * round.gridSize + columnIndex + 1}</small></span>
          )))}
        </div>
        {!active && (
          <div className={`board-state-cover ${countdown > 0 ? 'countdown' : ''}`} role="status">
            {countdown > 0 ? (
              <><span>{countdown}</span><strong>Board opens together</strong><small>Get your keyboard ready.</small></>
            ) : paused ? (
              <><Pause /><strong>Round paused</strong><small>The board and word entry are locked for everyone.</small></>
            ) : (
              <><LockKeyhole /><strong>Time’s up</strong><small>Your last saved list is being checked.</small></>
            )}
          </div>
        )}
      </div>

      <p className="round-instruction">Connect adjacent tiles horizontally, vertically, or diagonally. A tile cannot be reused in one word.</p>

      {isPlayer ? (
        <div className="online-answer-desk">
          <div className="online-answer-title">
            <div><Keyboard /><span><strong>Your private words</strong><small>No hints or validation until reveal.</small></span></div>
            <span className={`online-sync-state is-${ended ? 'locked' : syncState}`} aria-live="polite">{status.icon}{status.label}</span>
          </div>
          <form className="quick-word-form" onSubmit={submit}>
            <label><span className="sr-only">Add a word</span><input ref={inputRef} value={draft} onPointerDown={handleEntryPointerDown} onFocus={openEntryMode} onBlur={closeEntryMode} onChange={(event) => setDraft(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 80))} disabled={!active} placeholder={active ? 'TYPE A WORD' : countdown > 0 ? 'GET READY' : 'ENTRY LOCKED'} autoCapitalize="characters" autoComplete="off" enterKeyHint="enter" inputMode="text" spellCheck={false} /></label>
            <button className="primary-button" type="submit" disabled={!active || !draft.trim()} onPointerDown={(event) => { if (entryFocused) event.preventDefault() }}><Plus size={18} /> Add</button>
          </form>
          {words.length > 0 ? (
            <ol className="online-word-list">
              {words.map((word, index) => (
                <li key={word.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <label><span className="sr-only">Word {index + 1}</span><input value={word.value} onChange={(event) => onChange(word.id, event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 80))} disabled={!active} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
                  <button type="button" onClick={() => onRemove(word.id)} disabled={!active} aria-label={`Delete ${word.value || `word ${index + 1}`}`}><Trash2 size={17} /></button>
                </li>
              ))}
            </ol>
          ) : <p className="online-empty-list">Your words will collect here. Press Enter after each answer.</p>}
        </div>
      ) : (
        <div className="spectator-note"><Keyboard /><span><strong>Host control view</strong><small>You are coordinating this game without a player answer list.</small></span></div>
      )}

      {isHost && countdown === 0 && !ended && (
        <div className="host-controls online-host-controls">
          <button className="secondary-button" type="button" disabled={busy} onClick={paused ? onResume : onPause}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'Resume round' : 'Pause round'}</button>
          <button className="end-round-button" type="button" disabled={busy} onClick={onEnd}><Flag size={17} /> End early</button>
        </div>
      )}
    </section>
  )
}
