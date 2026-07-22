import {
  createGridCellOcrVariants,
  type GridCellImage,
  type GridCellOcrVariant,
  type GridCellRotation,
} from './grid-image'
import { normalizeGridCell } from './grid-path'

export type OcrProgress = {
  status: string
  progress: number
}

export type OcrWord = {
  text: string
  confidence: number | null
}

export type OcrLine = {
  text: string
  confidence: number | null
  words: OcrWord[]
}

export type OcrResult = {
  text: string
  confidence: number | null
  lines: OcrLine[]
  words: OcrWord[]
}

export type OcrAdapter = {
  recognize: (image: Blob) => Promise<OcrResult>
  terminate: () => Promise<void>
}

export type TesseractOcrOptions = {
  language?: string
  parameters?: Record<string, string>
  onProgress?: (progress: OcrProgress) => void
  /** Base URL containing worker.min.js, the core files, and language data. */
  assetBasePath?: string
  workerPath?: string
  corePath?: string
  langPath?: string
}

type TesseractItem = {
  text?: unknown
  confidence?: unknown
  words?: TesseractItem[]
  paragraphs?: Array<{ lines?: TesseractItem[] }>
}

type TesseractWorker = {
  recognize: (
    image: Blob,
    options?: Record<string, unknown>,
    output?: { blocks?: boolean },
  ) => Promise<{ data?: TesseractItem }>
  setParameters?: (parameters: Record<string, string>) => Promise<void>
  terminate: () => Promise<void>
}

type TesseractModule = {
  createWorker: (
    language?: string,
    oem?: number,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void
      workerPath?: string
      corePath?: string
      langPath?: string
    },
  ) => Promise<TesseractWorker>
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrEmpty(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function toWord(value: TesseractItem): OcrWord {
  return { text: textOrEmpty(value.text).trim(), confidence: numberOrNull(value.confidence) }
}

function extractLines(data: TesseractItem): OcrLine[] {
  const directLines = Array.isArray((data as { lines?: TesseractItem[] }).lines)
    ? (data as { lines: TesseractItem[] }).lines
    : []
  const blockLines = Array.isArray((data as { blocks?: TesseractItem[] }).blocks)
    ? (data as { blocks: TesseractItem[] }).blocks.flatMap((block) =>
        (block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []),
      )
    : []

  return [...directLines, ...blockLines]
    .map((line) => ({
      text: textOrEmpty(line.text).trim(),
      confidence: numberOrNull(line.confidence),
      words: (line.words ?? []).map(toWord).filter((word) => word.text.length > 0),
    }))
    .filter((line) => line.text.length > 0 || line.words.length > 0)
}

function normalizeTesseractResult(data: TesseractItem | undefined): OcrResult {
  const safeData = data ?? {}
  const lines = extractLines(safeData)
  const directWords = Array.isArray(safeData.words) ? safeData.words.map(toWord) : []
  const words = (directWords.length > 0 ? directWords : lines.flatMap((line) => line.words)).filter(
    (word) => word.text.length > 0,
  )

  const detailedConfidences = [
    ...lines.map((line) => line.confidence),
    ...words.map((word) => word.confidence),
  ].filter((confidence): confidence is number => confidence !== null)
  const pageConfidence = numberOrNull(safeData.confidence)

  return {
    text: textOrEmpty(safeData.text),
    confidence:
      pageConfidence !== null && pageConfidence > 0
        ? pageConfidence
        : detailedConfidences.length > 0
          ? Math.max(...detailedConfidences)
          : pageConfidence,
    lines,
    words,
  }
}

/**
 * Tesseract is loaded only when recognition starts, keeping the main game bundle
 * small and allowing typed/manual answer entry when OCR cannot initialize.
 */
export function createTesseractOcrAdapter(options: TesseractOcrOptions = {}): OcrAdapter {
  let workerPromise: Promise<TesseractWorker> | null = null
  const assetBasePath = (options.assetBasePath ?? '/tesseract').replace(/\/$/, '')

  const getWorker = async () => {
    if (!workerPromise) {
      workerPromise = import('tesseract.js')
        .then(async (module) => {
          const tesseract = module as unknown as TesseractModule
          const worker = await tesseract.createWorker(options.language ?? 'eng', undefined, {
            workerPath: options.workerPath ?? `${assetBasePath}/worker.min.js`,
            corePath: options.corePath ?? assetBasePath,
            langPath: options.langPath ?? assetBasePath,
            logger: (message) =>
              options.onProgress?.({
                status: message.status ?? 'recognizing',
                progress: Math.min(1, Math.max(0, message.progress ?? 0)),
              }),
          })
          if (options.parameters && worker.setParameters) {
            await worker.setParameters(options.parameters)
          }
          return worker
        })
        .catch((error: unknown) => {
          workerPromise = null
          const message = error instanceof Error ? error.message : 'Unknown OCR initialization error'
          throw new Error(`OCR is unavailable: ${message}`)
        })
    }
    return workerPromise
  }

  return {
    async recognize(image) {
      const worker = await getWorker()
      const result = await worker.recognize(image, {}, { blocks: true })
      return normalizeTesseractResult(result.data)
    },
    async terminate() {
      if (!workerPromise) return
      const activeWorker = await workerPromise.catch(() => null)
      workerPromise = null
      if (activeWorker) await activeWorker.terminate()
    },
  }
}

export type RecognizedGridCell = {
  row: number
  column: number
  rawText: string
  suggestedValue: string
  confidence: number | null
  rotation: GridCellRotation
  needsReview: boolean
}

export type GridCellRecognitionOptions = {
  /** Skip the remaining rotations when the upright pass is already very certain. */
  fastAcceptConfidence?: number
  reviewConfidence?: number
  prepareVariants?: (cell: GridCellImage) => Promise<readonly GridCellOcrVariant[]>
}

type GridCellCandidate = {
  rawText: string
  suggestedValue: string
  confidence: number | null
  rotation: GridCellRotation
  exactTileValue: boolean
}

function candidateFromResult(result: OcrResult, rotation: GridCellRotation): GridCellCandidate {
  const rawText = result.text.trim()
  const letters = rawText.toUpperCase().replace(/[^A-Z]/g, '')
  const exactTileValue = /^(?:[A-Z]|QU)$/.test(letters)
  const suggestedValue = normalizeGridCell(letters === 'QU' ? 'QU' : letters.slice(0, 1))

  return {
    rawText,
    suggestedValue,
    confidence: result.confidence,
    rotation,
    exactTileValue,
  }
}

function confidenceValue(candidate: GridCellCandidate) {
  return candidate.confidence ?? -1
}

function compareCandidates(left: GridCellCandidate, right: GridCellCandidate) {
  if (left.exactTileValue !== right.exactTileValue) return left.exactTileValue ? -1 : 1
  return confidenceValue(right) - confidenceValue(left)
}

function selectGridCellCandidate(
  candidates: readonly GridCellCandidate[],
  reviewConfidence: number,
) {
  const ranked = [...candidates].sort(compareCandidates)
  const best = ranked[0] ?? candidateFromResult({ text: '', confidence: null, lines: [], words: [] }, 0)
  const competingLetter = ranked.find(
    (candidate) =>
      candidate.exactTileValue &&
      candidate.suggestedValue !== best.suggestedValue,
  )
  // Single-glyph OCR confidence is not reliable enough to dismiss a different
  // valid letter found at another rotation (notably M/W and N/Z). Surface the
  // ambiguity for the host instead of silently trusting the higher score.
  const ambiguous = Boolean(best.exactTileValue && competingLetter)

  return {
    best,
    needsReview:
      !best.exactTileValue ||
      best.confidence === null ||
      best.confidence < reviewConfidence ||
      ambiguous,
  }
}

export async function recognizeGridCells(
  cells: readonly GridCellImage[],
  adapter: OcrAdapter,
  onCellComplete?: (completed: number, total: number) => void,
  options: GridCellRecognitionOptions = {},
): Promise<RecognizedGridCell[]> {
  const recognized: RecognizedGridCell[] = []
  const fastAcceptConfidence = options.fastAcceptConfidence ?? 97
  const reviewConfidence = options.reviewConfidence ?? 75
  const prepareVariants = options.prepareVariants ?? createGridCellOcrVariants

  // Sequential recognition avoids allocating several heavyweight OCR jobs on a phone.
  for (const cell of cells) {
    const variants = await prepareVariants(cell)
    const candidates: GridCellCandidate[] = []

    for (const [index, variant] of variants.entries()) {
      const result = await adapter.recognize(variant.blob)
      const candidate = candidateFromResult(result, variant.rotation)
      candidates.push(candidate)

      // Most upright tiles need one pass. Low-confidence or invalid results get
      // the full four-way search that handles sideways and upside-down tiles.
      if (
        index === 0 &&
        candidate.rotation === 0 &&
        candidate.exactTileValue &&
        candidate.confidence !== null &&
        candidate.confidence >= fastAcceptConfidence
      ) {
        break
      }
    }

    const selection = selectGridCellCandidate(candidates, reviewConfidence)
    recognized.push({
      row: cell.row,
      column: cell.column,
      rawText: selection.best.rawText,
      suggestedValue: selection.best.suggestedValue,
      confidence: selection.best.confidence,
      rotation: selection.best.rotation,
      needsReview: selection.needsReview,
    })
    onCellComplete?.(recognized.length, cells.length)
  }

  return recognized
}
