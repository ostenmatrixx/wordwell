import { describe, expect, it, vi } from 'vitest'
import {
  areBoardTilesAdjacent,
  boardTraceWord,
  extendBoardTrace,
  submitBoardTrace,
} from './board-trace'

const board = [
  ['QU', 'I', 'Z', 'A'],
  ['B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M'],
]

describe('board swipe tracing', () => {
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
