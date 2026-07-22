import { describe, expect, it } from 'vitest'
import { calculateGridCellRectangles } from './grid-image'

describe('board image grid splitting', () => {
  it('creates row-major rectangles for a 4 by 4 board', () => {
    const cells = calculateGridCellRectangles(400, 400, 4, 0)
    expect(cells).toHaveLength(16)
    expect(cells[0]).toEqual({ row: 0, column: 0, x: 0, y: 0, width: 100, height: 100 })
    expect(cells[15]).toEqual({ row: 3, column: 3, x: 300, y: 300, width: 100, height: 100 })
  })

  it('supports rectangular photos, 5 by 5 boards, and cell insets', () => {
    const cells = calculateGridCellRectangles(500, 1000, 5, 0.1)
    expect(cells).toHaveLength(25)
    expect(cells[0]).toEqual({ row: 0, column: 0, x: 10, y: 20, width: 80, height: 160 })
    expect(cells[6]).toEqual({ row: 1, column: 1, x: 110, y: 220, width: 80, height: 160 })
  })

  it('rejects non-positive image dimensions', () => {
    expect(() => calculateGridCellRectangles(0, 100, 4)).toThrow('positive')
  })
})
