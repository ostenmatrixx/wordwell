import { describe, expect, it } from 'vitest'
import { recognizeGridCells, type OcrAdapter, type OcrResult } from './capture-ocr'
import type { GridCellImage, GridCellRotation } from './grid-image'

function cell(row: number, column: number, value: string): GridCellImage {
  return { row, column, x: column * 10, y: row * 10, width: 10, height: 10, blob: new Blob([value]) }
}

function variants(...rotations: GridCellRotation[]) {
  return async (source: GridCellImage) => {
    const value = await source.blob.text()
    return rotations.map((rotation) => ({
      rotation,
      blob: new Blob([`${value}:${rotation}`]),
    }))
  }
}

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
    const cells = [cell(0, 0, 'a'), cell(0, 1, 'b')]

    await expect(
      recognizeGridCells(cells, adapter, (complete) => progress.push(complete), {
        fastAcceptConfidence: 90,
        prepareVariants: variants(0),
      }),
    ).resolves.toEqual([
      {
        row: 0,
        column: 0,
        rawText: 'qU',
        suggestedValue: 'QU',
        confidence: 92,
        rotation: 0,
        needsReview: false,
      },
      {
        row: 0,
        column: 1,
        rawText: '8',
        suggestedValue: '',
        confidence: 44,
        rotation: 0,
        needsReview: true,
      },
    ])
    expect(progress).toEqual([1, 2])
  })

  it('selects a valid sideways reading over low-confidence upright noise', async () => {
    const results = new Map<string, OcrResult>([
      ['tile:0', { text: '>', confidence: 18, lines: [], words: [] }],
      ['tile:90', { text: ' M ', confidence: 89, lines: [], words: [] }],
      ['tile:180', { text: '8', confidence: 61, lines: [], words: [] }],
      ['tile:270', { text: '', confidence: 12, lines: [], words: [] }],
    ])
    const adapter: OcrAdapter = {
      recognize: async (image) => results.get(await image.text()) as OcrResult,
      terminate: async () => undefined,
    }

    await expect(
      recognizeGridCells([cell(0, 0, 'tile')], adapter, undefined, {
        prepareVariants: variants(0, 90, 180, 270),
      }),
    ).resolves.toEqual([
      {
        row: 0,
        column: 0,
        rawText: 'M',
        suggestedValue: 'M',
        confidence: 89,
        rotation: 90,
        needsReview: false,
      },
    ])
  })

  it('flags close competing letters for manual review', async () => {
    const results = new Map<string, OcrResult>([
      ['tile:0', { text: '?', confidence: 20, lines: [], words: [] }],
      ['tile:90', { text: 'M', confidence: 86, lines: [], words: [] }],
      ['tile:180', { text: '', confidence: 10, lines: [], words: [] }],
      ['tile:270', { text: 'W', confidence: 82, lines: [], words: [] }],
    ])
    const adapter: OcrAdapter = {
      recognize: async (image) => results.get(await image.text()) as OcrResult,
      terminate: async () => undefined,
    }

    const [result] = await recognizeGridCells([cell(0, 0, 'tile')], adapter, undefined, {
      prepareVariants: variants(0, 90, 180, 270),
    })
    expect(result).toMatchObject({ suggestedValue: 'M', rotation: 90, needsReview: true })
  })

  it('skips extra rotations for a very high-confidence upright tile', async () => {
    let attempts = 0
    const adapter: OcrAdapter = {
      recognize: async () => {
        attempts += 1
        return { text: 'A', confidence: 98, lines: [], words: [] }
      },
      terminate: async () => undefined,
    }

    const [result] = await recognizeGridCells([cell(0, 0, 'tile')], adapter, undefined, {
      prepareVariants: variants(0, 90, 180, 270),
    })
    expect(result).toMatchObject({ suggestedValue: 'A', rotation: 0, needsReview: false })
    expect(attempts).toBe(1)
  })
})
