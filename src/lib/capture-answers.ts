import type { OcrResult } from './capture-ocr'

export type DraftConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'

export type AnswerDraftRow = {
  id: string
  rawText: string
  normalized: string
  confidence: number | null
  confidenceLevel: DraftConfidenceLevel
  source: 'ocr' | 'manual'
  needsReview: boolean
}

export type AnswerDraftOptions = {
  idFactory?: () => string
  lowConfidenceThreshold?: number
  mediumConfidenceThreshold?: number
}

let fallbackId = 0

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackId += 1
  return `answer-${Date.now()}-${fallbackId}`
}

export function normalizeAnswerWord(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function confidenceLevel(
  confidence: number | null,
  lowThreshold: number,
  mediumThreshold: number,
): DraftConfidenceLevel {
  if (confidence === null) return 'unknown'
  if (confidence < lowThreshold) return 'low'
  if (confidence < mediumThreshold) return 'medium'
  return 'high'
}

export function createAnswerDraftRow(
  rawText: string,
  confidence: number | null = null,
  source: AnswerDraftRow['source'] = 'manual',
  options: AnswerDraftOptions = {},
): AnswerDraftRow {
  const normalized = normalizeAnswerWord(rawText)
  const lowThreshold = options.lowConfidenceThreshold ?? 70
  const mediumThreshold = options.mediumConfidenceThreshold ?? 85
  const level = confidenceLevel(confidence, lowThreshold, mediumThreshold)

  return {
    id: (options.idFactory ?? createId)(),
    rawText: rawText.trim(),
    normalized,
    confidence,
    confidenceLevel: level,
    source,
    needsReview: source === 'ocr' && (level === 'low' || level === 'unknown' || !/^[A-Z]+$/.test(normalized)),
  }
}

function tokenizeLine(line: string) {
  return line
    .split(/[\s,;|]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export function answerTextToDraftRows(
  text: string,
  confidence: number | null = null,
  source: AnswerDraftRow['source'] = 'manual',
  options: AnswerDraftOptions = {},
) {
  return text
    .split(/\r?\n/)
    .flatMap(tokenizeLine)
    .map((value) => createAnswerDraftRow(value, confidence, source, options))
}

export function createAnswerDraftRows(result: OcrResult, options: AnswerDraftOptions = {}) {
  if (result.words.length > 0) {
    return result.words.flatMap((word) =>
      tokenizeLine(word.text).map((value) =>
        createAnswerDraftRow(value, word.confidence ?? result.confidence, 'ocr', options),
      ),
    )
  }

  if (result.lines.length > 0) {
    return result.lines.flatMap((line) =>
      tokenizeLine(line.text).map((value) =>
        createAnswerDraftRow(value, line.confidence ?? result.confidence, 'ocr', options),
      ),
    )
  }

  return answerTextToDraftRows(result.text, result.confidence, 'ocr', options)
}

export function updateAnswerDraftRow(
  row: AnswerDraftRow,
  rawText: string,
): AnswerDraftRow {
  const normalized = normalizeAnswerWord(rawText)
  return {
    ...row,
    rawText,
    normalized,
    needsReview: !/^[A-Z]+$/.test(normalized),
  }
}

export function splitAnswerDraftRow(
  rows: readonly AnswerDraftRow[],
  rowId: string,
  parts: readonly string[],
  options: AnswerDraftOptions = {},
) {
  const index = rows.findIndex((row) => row.id === rowId)
  if (index < 0) return [...rows]
  const original = rows[index]
  const replacements = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => createAnswerDraftRow(part, original.confidence, original.source, options))
  return [...rows.slice(0, index), ...replacements, ...rows.slice(index + 1)]
}

export function mergeAnswerDraftRows(
  rows: readonly AnswerDraftRow[],
  rowIds: readonly string[],
  options: AnswerDraftOptions = {},
) {
  const selected = new Set(rowIds)
  const indexes = rows.flatMap((row, index) => (selected.has(row.id) ? [index] : []))
  if (indexes.length < 2) return [...rows]
  const insertionIndex = Math.min(...indexes)
  const mergedRows = indexes.map((index) => rows[index])
  const merged = createAnswerDraftRow(
    mergedRows.map((row) => row.rawText).join(''),
    mergedRows.every((row) => row.confidence !== null)
      ? Math.min(...mergedRows.map((row) => row.confidence as number))
      : null,
    mergedRows.some((row) => row.source === 'ocr') ? 'ocr' : 'manual',
    options,
  )

  const remaining = rows.filter((row) => !selected.has(row.id))
  return [...remaining.slice(0, insertionIndex), merged, ...remaining.slice(insertionIndex)]
}

export function reorderAnswerDraftRows(
  rows: readonly AnswerDraftRow[],
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex >= rows.length ||
    fromIndex === toIndex
  ) {
    return [...rows]
  }
  const reordered = [...rows]
  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)
  return reordered
}

