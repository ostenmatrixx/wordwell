import { describe, expect, it } from 'vitest'
import {
  canTraceWord,
  findGridPath,
  getGridValidationIssues,
  normalizeBoardGrid,
} from './grid-path'

const board = [
  ['C', 'A', 'T', 'S'],
  ['D', 'O', 'G', 'E'],
  ['R', 'A', 'I', 'N'],
  ['Q', 'U', 'I', 'Z'],
]

describe('grid path validation', () => {
  it('finds horizontal, vertical, and diagonal paths', () => {
    expect(findGridPath(board, 'cats')).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 0, column: 3 },
    ])
    expect(canTraceWord(board, 'cord')).toBe(true)
    expect(canTraceWord(board, 'coin')).toBe(true)
  })

  it('does not reuse a cell', () => {
    expect(canTraceWord(board, 'CACA')).toBe(false)
  })

  it('treats QU as one board cell that consumes two letters', () => {
    const quBoard = [
      ['QU', 'I', 'Z', 'A'],
      ['B', 'C', 'D', 'E'],
      ['F', 'G', 'H', 'I'],
      ['J', 'K', 'L', 'M'],
    ]

    expect(findGridPath(quBoard, 'quiz')).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
    ])
    expect(canTraceWord(quBoard, 'QIZ')).toBe(false)
  })

  it('allows standalone Q to connect to a separate U', () => {
    expect(findGridPath(board, 'quiz')).toEqual([
      { row: 3, column: 0 },
      { row: 3, column: 1 },
      { row: 2, column: 2 },
      { row: 3, column: 3 },
    ])
  })

  it('supports and normalizes a 5 by 5 board', () => {
    const five = Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 5 }, (_, column) => (row === 0 && column === 0 ? ' qu ' : 'a')),
    )
    expect(normalizeBoardGrid(five)[0][0]).toBe('QU')
    expect(getGridValidationIssues(five)).toEqual([])
  })

  it('rejects malformed boards, cells, and words without throwing during search', () => {
    expect(getGridValidationIssues([['A']]).length).toBeGreaterThan(0)
    expect(getGridValidationIssues([['A', 'B', 'C', 'D'], ['E'], ['F'], ['G']]).length).toBeGreaterThan(0)
    expect(canTraceWord([['A']], 'A')).toBe(false)
    expect(canTraceWord(board, 'C4T')).toBe(false)
  })

  it('returns the same path for ambiguous matches', () => {
    const repeated = Array.from({ length: 4 }, () => Array<string>(4).fill('A'))
    expect(findGridPath(repeated, 'AAA')).toEqual(findGridPath(repeated, 'AAA'))
  })
})
