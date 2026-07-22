import type { GridCellImage } from './grid-image'
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
  recognize: (image: Blob) => Promise<{ data?: TesseractItem }>
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

  return {
    text: textOrEmpty(safeData.text),
    confidence: numberOrNull(safeData.confidence),
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
      const result = await worker.recognize(image)
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
  needsReview: boolean
}

export async function recognizeGridCells(
  cells: readonly GridCellImage[],
  adapter: OcrAdapter,
  onCellComplete?: (completed: number, total: number) => void,
): Promise<RecognizedGridCell[]> {
  const recognized: RecognizedGridCell[] = []

  // Sequential recognition avoids allocating several heavyweight OCR jobs on a phone.
  for (const cell of cells) {
    const result = await adapter.recognize(cell.blob)
    const rawText = result.text.trim()
    const letters = rawText.toUpperCase().replace(/[^A-Z]/g, '')
    const suggestedValue = normalizeGridCell(letters === 'QU' ? 'QU' : letters.slice(0, 1))
    recognized.push({
      row: cell.row,
      column: cell.column,
      rawText,
      suggestedValue,
      confidence: result.confidence,
      needsReview:
        !/^(?:[A-Z]|QU)$/.test(suggestedValue) ||
        result.confidence === null ||
        result.confidence < 75,
    })
    onCellComplete?.(recognized.length, cells.length)
  }

  return recognized
}
