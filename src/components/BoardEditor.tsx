import { Camera, Check, Grid3X3, RefreshCw } from 'lucide-react'

type Props = {
  size: 4 | 5
  cells: string[]
  scanning?: boolean
  onSizeChange: (size: 4 | 5) => void
  onCellChange: (index: number, value: string) => void
  onScan: () => void
  onConfirm: () => void
}

export function BoardEditor({ size, cells, scanning, onSizeChange, onCellChange, onScan, onConfirm }: Props) {
  const expected = size * size
  const complete = cells.slice(0, expected).every((cell) => /^(?:[A-Z]|QU)$/.test(cell))

  return (
    <section className="play-card board-editor" aria-labelledby="board-title">
      <div className="card-heading">
        <div>
          <p className="section-kicker">Host setup</p>
          <h2 id="board-title"><Grid3X3 size={22} /> Confirm the letter board</h2>
          <p>Scan the physical setup, then correct every tile before the timer begins.</p>
        </div>
        <div className="segmented" aria-label="Board size">
          {[4, 5].map((value) => (
            <button key={value} type="button" className={size === value ? 'is-selected' : ''} onClick={() => onSizeChange(value as 4 | 5)}>{value}×{value}</button>
          ))}
        </div>
      </div>

      <button className="scan-board-button" type="button" onClick={onScan} disabled={scanning}>
        {scanning ? <RefreshCw className="spin" /> : <Camera />}
        <span><strong>{scanning ? 'Reading the tiles…' : 'Scan board setup'}</strong><small>Camera or photo library · image stays private</small></span>
      </button>

      <div className={`letter-grid size-${size}`} aria-label={`${size} by ${size} board`}>
        {Array.from({ length: expected }, (_, index) => {
          const row = Math.floor(index / size) + 1
          const column = (index % size) + 1
          return (
            <label key={index}>
              <span className="sr-only">Row {row}, column {column}</span>
              <input
                value={cells[index] ?? ''}
                maxLength={2}
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                onChange={(event) => onCellChange(index, event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
              />
              <small>{index + 1}</small>
            </label>
          )
        })}
      </div>
      <p className="board-help">Use <strong>QU</strong> for a combined Qu tile. Every cell must be one letter or QU.</p>
      <button className="primary-button full-button" type="button" onClick={onConfirm} disabled={!complete}>
        <Check size={18} /> Confirm board and start round
      </button>
    </section>
  )
}

