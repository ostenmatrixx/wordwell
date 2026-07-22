import { describe, expect, it } from 'vitest'
import { recognizeGridCells, type OcrAdapter, type OcrResult } from './capture-ocr'

describe('grid cell OCR review', () => {
  it('normalizes suggestions while preserving raw OCR and confidence', async () => {
    const results: OcrResult[] = [
      { text: ' qU\n', confidence: 92, lines: [], words: [] },
      { text: '8', confidence: 44, lines: [], words: [] },
    ]
    const adapter: OcrAdapter = {
      recognize: async () => results.shift() as OcrResult,
      terminate: async () => undefined,
    }
    const progress: number[] = []
    const cells = [
      { row: 0, column: 0, x: 0, y: 0, width: 10, height: 10, blob: new Blob(['a']) },
      { row: 0, column: 1, x: 10, y: 0, width: 10, height: 10, blob: new Blob(['b']) },
    ]

    await expect(
      recognizeGridCells(cells, adapter, (complete) => progress.push(complete)),
    ).resolves.toEqual([
      {
        row: 0,
        column: 0,
        rawText: 'qU',
        suggestedValue: 'QU',
        confidence: 92,
        needsReview: false,
      },
      {
        row: 0,
        column: 1,
        rawText: '8',
        suggestedValue: '',
        confidence: 44,
        needsReview: true,
      },
    ])
    expect(progress).toEqual([1, 2])
  })
})

