import { describe, expect, it } from 'vitest'
import {
  boardRotationAnnouncement,
  boardRotationDegrees,
  nextBoardQuarterTurn,
  rotatedBoardCells,
  type BoardQuarterTurn,
} from './board-rotation'

const board4 = [
  ['A', 'B', 'C', 'D'],
  ['E', 'F', 'G', 'H'],
  ['I', 'J', 'K', 'L'],
  ['M', 'N', 'O', 'P'],
]

const board5 = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y'],
]

function valuesAt(turn: BoardQuarterTurn, grid = board4) {
  return rotatedBoardCells(grid, turn).map((cell) => cell.value)
}

describe('board rotation', () => {
  it('cycles through the four clockwise quarter turns', () => {
    let turn: BoardQuarterTurn = 0
    turn = nextBoardQuarterTurn(turn)
    expect(turn).toBe(1)
    turn = nextBoardQuarterTurn(turn)
    expect(turn).toBe(2)
    turn = nextBoardQuarterTurn(turn)
    expect(turn).toBe(3)
    turn = nextBoardQuarterTurn(turn)
    expect(turn).toBe(0)
  })

  it('maps a 4 by 4 board through every upright-letter orientation', () => {
    expect(valuesAt(0)).toEqual([
      'A', 'B', 'C', 'D',
      'E', 'F', 'G', 'H',
      'I', 'J', 'K', 'L',
      'M', 'N', 'O', 'P',
    ])
    expect(valuesAt(1)).toEqual([
      'M', 'I', 'E', 'A',
      'N', 'J', 'F', 'B',
      'O', 'K', 'G', 'C',
      'P', 'L', 'H', 'D',
    ])
    expect(valuesAt(2)).toEqual([
      'P', 'O', 'N', 'M',
      'L', 'K', 'J', 'I',
      'H', 'G', 'F', 'E',
      'D', 'C', 'B', 'A',
    ])
    expect(valuesAt(3)).toEqual([
      'D', 'H', 'L', 'P',
      'C', 'G', 'K', 'O',
      'B', 'F', 'J', 'N',
      'A', 'E', 'I', 'M',
    ])
  })

  it('rotates a 5 by 5 board through all orientations while preserving source indices', () => {
    const expectedFirstRows = [
      [0, 1, 2, 3, 4],
      [20, 15, 10, 5, 0],
      [24, 23, 22, 21, 20],
      [4, 9, 14, 19, 24],
    ]

    for (const turn of [0, 1, 2, 3] as const) {
      const cells = rotatedBoardCells(board5, turn)
      expect(cells.slice(0, 5).map((cell) => cell.sourceIndex)).toEqual(expectedFirstRows[turn])
      expect(cells).toHaveLength(25)
      expect(new Set(cells.map((cell) => cell.sourceIndex)).size).toBe(25)
      expect(cells.every((cell) => (
        cell.value === board5[Math.floor(cell.sourceIndex / 5)][cell.sourceIndex % 5]
      ))).toBe(true)
    }
  })

  it('returns to the unchanged canonical board after four turns', () => {
    const original = board4.map((row) => [...row])
    let finalTurn: BoardQuarterTurn = 0
    for (let turnCount = 0; turnCount < 4; turnCount += 1) {
      finalTurn = nextBoardQuarterTurn(finalTurn)
    }

    expect(finalTurn).toBe(0)
    expect(valuesAt(finalTurn)).toEqual(board4.flat())
    expect(board4).toEqual(original)
  })

  it('describes the current orientation for controls and announcements', () => {
    expect(boardRotationDegrees(3)).toBe(270)
    expect(boardRotationAnnouncement(1)).toBe('Board rotated 90 degrees clockwise')
    expect(boardRotationAnnouncement(0)).toBe('Board returned upright')
  })

  it('rejects a non-square board', () => {
    expect(rotatedBoardCells([['A', 'B'], ['C']], 1)).toEqual([])
  })
})
