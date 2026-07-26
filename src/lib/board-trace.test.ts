import { describe, expect, it, vi } from 'vitest'
import {
  BOARD_TRACE_ACTIVATION_RATIO,
  areBoardTilesAdjacent,
  boardTraceWord,
  extendBoardTrace,
  isPointInBoardTileActivationZone,
  submitBoardTrace,
} from './board-trace'

const board = [
  ['QU', 'I', 'Z', 'A'],
  ['B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M'],
]

describe('board swipe tracing', () => {
  it('uses the centered 60 percent of a tile as its activation zone', () => {
    const bounds = { left: 10, top: 20, width: 100, height: 80 }
    expect(BOARD_TRACE_ACTIVATION_RATIO).toBe(0.6)
    expect(isPointInBoardTileActivationZone(60, 60, bounds)).toBe(true)
    expect(isPointInBoardTileActivationZone(30, 36, bounds)).toBe(true)
    expect(isPointInBoardTileActivationZone(90, 84, bounds)).toBe(true)
  })

  it('ignores the outer 20 percent on every edge of a tile', () => {
    const bounds = { left: 10, top: 20, width: 100, height: 80 }
    expect(isPointInBoardTileActivationZone(29.9, 60, bounds)).toBe(false)
    expect(isPointInBoardTileActivationZone(90.1, 60, bounds)).toBe(false)
    expect(isPointInBoardTileActivationZone(60, 35.9, bounds)).toBe(false)
    expect(isPointInBoardTileActivationZone(60, 84.1, bounds)).toBe(false)
  })

  it('rejects invalid activation geometry and ratios', () => {
    const bounds = { left: 0, top: 0, width: 100, height: 100 }
    expect(isPointInBoardTileActivationZone(Number.NaN, 50, bounds)).toBe(false)
    expect(isPointInBoardTileActivationZone(50, 50, { ...bounds, width: 0 })).toBe(false)
    expect(isPointInBoardTileActivationZone(50, 50, bounds, 0)).toBe(false)
    expect(isPointInBoardTileActivationZone(50, 50, bounds, 1.1)).toBe(false)
  })

  it('allows all eight neighbouring directions', () => {
    const neighbours = [0, 1, 2, 4, 6, 8, 9, 10]
    expect(neighbours.every((index) => areBoardTilesAdjacent(5, index, 4))).toBe(true)
  })

  it('adds adjacent tiles while ignoring jumps and reused tiles', () => {
    expect(extendBoardTrace([0], 1, 4)).toEqual([0, 1])
    expect(extendBoardTrace([0], 10, 4)).toEqual([0])
    expect(extendBoardTrace([0, 1, 5], 0, 4)).toEqual([0, 1, 5])
    expect(extendBoardTrace([0, 1], 1, 4)).toEqual([0, 1])
  })

  it('backtracks when the trace returns to the immediately previous tile', () => {
    expect(extendBoardTrace([0, 1, 5], 1, 4)).toEqual([0, 1])
  })

  it('builds words in path order and treats QU as one two-letter cube', () => {
    expect(boardTraceWord(board, [0, 1, 2])).toBe('QUIZ')
  })

  it('submits a completed word exactly once', () => {
    const onSubmit = vi.fn()
    expect(submitBoardTrace(board, [0, 1, 2], 4, onSubmit)).toEqual({
      status: 'submitted',
      word: 'QUIZ',
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('QUIZ')
  })

  it('does not submit empty or short traces', () => {
    const onSubmit = vi.fn()
    expect(submitBoardTrace(board, [], 4, onSubmit)).toEqual({ status: 'empty', word: '' })
    expect(submitBoardTrace(board, [1, 2], 4, onSubmit)).toEqual({
      status: 'too-short',
      word: 'IZ',
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
