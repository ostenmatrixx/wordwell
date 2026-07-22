import { describe, expect, it } from 'vitest'
import {
  answerTextToDraftRows,
  createAnswerDraftRows,
  mergeAnswerDraftRows,
  normalizeAnswerWord,
  reorderAnswerDraftRows,
  splitAnswerDraftRow,
  updateAnswerDraftRow,
} from './capture-answers'

const ids = () => {
  let index = 0
  return () => `row-${(index += 1)}`
}

describe('answer OCR drafts', () => {
  it('normalizes OCR text into editable rows', () => {
    const rows = createAnswerDraftRows(
      {
        text: 'fallback',
        confidence: 91,
        lines: [],
        words: [
          { text: ' apple ', confidence: 93 },
          { text: 'pear,plum', confidence: 64 },
        ],
      },
      { idFactory: ids() },
    )

    expect(rows.map(({ id, normalized, confidenceLevel, needsReview }) => ({ id, normalized, confidenceLevel, needsReview }))).toEqual([
      { id: 'row-1', normalized: 'APPLE', confidenceLevel: 'high', needsReview: false },
      { id: 'row-2', normalized: 'PEAR', confidenceLevel: 'low', needsReview: true },
      { id: 'row-3', normalized: 'PLUM', confidenceLevel: 'low', needsReview: true },
    ])
  })

  it('supports manual multiline input and keeps invalid characters visible', () => {
    const rows = answerTextToDraftRows('cat dog\nb1rd', null, 'manual', { idFactory: ids() })
    expect(rows.map((row) => row.normalized)).toEqual(['CAT', 'DOG', 'B1RD'])
    expect(normalizeAnswerWord(' qu iz ')).toBe('QUIZ')
  })

  it('updates, splits, merges, and reorders rows immutably', () => {
    const idFactory = ids()
    const original = answerTextToDraftRows('sun moon', 90, 'ocr', { idFactory })
    const updated = updateAnswerDraftRow(original[0], 'star')
    expect(updated.normalized).toBe('STAR')
    expect(original[0].normalized).toBe('SUN')

    const split = splitAnswerDraftRow(original, original[0].id, ['rain', 'bow'], { idFactory })
    expect(split.map((row) => row.normalized)).toEqual(['RAIN', 'BOW', 'MOON'])

    const merged = mergeAnswerDraftRows(split, [split[0].id, split[1].id], { idFactory })
    expect(merged.map((row) => row.normalized)).toEqual(['RAINBOW', 'MOON'])
    expect(reorderAnswerDraftRows(merged, 0, 1).map((row) => row.normalized)).toEqual([
      'MOON',
      'RAINBOW',
    ])
  })
})
