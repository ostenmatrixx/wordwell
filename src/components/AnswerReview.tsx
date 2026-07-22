import { Camera, Check, GripVertical, Plus, ScanText, Trash2 } from 'lucide-react'
import type { EditableWord } from '../types'

type Props = {
  words: EditableWord[]
  processing?: boolean
  submitting?: boolean
  onScan: () => void
  onChange: (id: string, value: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onConfirm: () => void
}

export function AnswerReview({ words, processing, submitting, onScan, onChange, onAdd, onRemove, onConfirm }: Props) {
  const completeWords = words.filter((word) => word.raw.trim())

  return (
    <section className="play-card answer-review" aria-labelledby="answers-title">
      <div className="card-heading">
        <div>
          <p className="section-kicker">Your private answer sheet</p>
          <h2 id="answers-title"><ScanText size={22} /> Scan, then review every word</h2>
          <p>Nothing is checked or scored until you approve this list.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onScan} disabled={processing}>
          <Camera size={17} /> {processing ? 'Reading…' : 'Scan answers'}
        </button>
      </div>

      {words.length === 0 ? (
        <button className="answer-empty" type="button" onClick={onScan}>
          <span><Camera size={28} /></span>
          <strong>Photograph your handwritten list</strong>
          <small>Printed handwriting works best. You will always review the result.</small>
        </button>
      ) : (
        <ol className="editable-words">
          {words.map((word, index) => (
            <li className={word.confidence !== undefined && word.confidence < 70 ? 'low-confidence' : ''} key={word.id}>
              <GripVertical className="drag-hint" size={17} aria-hidden="true" />
              <span className="word-number">{index + 1}</span>
              <label>
                <span className="sr-only">Answer {index + 1}</span>
                <input
                  value={word.raw}
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(event) => onChange(word.id, event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                />
                {word.confidence !== undefined && word.confidence < 70 && <small>Check this scan</small>}
              </label>
              <button type="button" onClick={() => onRemove(word.id)} aria-label={`Delete answer ${index + 1}`}><Trash2 size={17} /></button>
            </li>
          ))}
        </ol>
      )}

      <button className="add-word-button" type="button" onClick={onAdd}><Plus size={17} /> Add a word manually</button>
      <div className="review-confirm">
        <p><strong>{completeWords.length}</strong> {completeWords.length === 1 ? 'word' : 'words'} ready · duplicates stay hidden until reveal</p>
        <button className="primary-button" type="button" onClick={onConfirm} disabled={submitting || completeWords.length === 0}>
          <Check size={18} /> {submitting ? 'Sending safely…' : 'Confirm my words'}
        </button>
      </div>
    </section>
  )
}

