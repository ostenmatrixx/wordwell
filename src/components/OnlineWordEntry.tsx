import { useState, type FormEvent } from 'react'
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
  const paused = Boolean(round.timerPausedAt)
  const ended = seconds <= 0 && countdown <= 0
  const active = countdown <= 0 && !paused && !ended
  const status = syncCopy(ended ? 'locked' : syncState)

  function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = draft.trim().toUpperCase().replace(/[^A-Z]/g, '')
    if (!normalized || !active) return
    onAdd(normalized)
    setDraft('')
  }

  return (
    <section className="play-card online-round" aria-labelledby="online-round-title">
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
            <label><span className="sr-only">Add a word</span><input value={draft} onChange={(event) => setDraft(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 80))} disabled={!active} placeholder={active ? 'TYPE A WORD' : countdown > 0 ? 'GET READY' : 'ENTRY LOCKED'} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
            <button className="primary-button" type="submit" disabled={!active || !draft.trim()}><Plus size={18} /> Add</button>
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
