import { describe, expect, it } from 'vitest'
import {
  evaluateGridRound,
  findGridPath,
  normalizeRoundWord,
  type GridRoundSnapshot,
} from './round-engine'

const grid = [
  ['C', 'A', 'T', 'S'],
  ['D', 'O', 'G', 'E'],
  ['P', 'L', 'A', 'N'],
  ['QU', 'I', 'Z', 'R'],
]

const dictionary = new Set(['CAT', 'CATS', 'DOG', 'DOGE', 'PLAN', 'QUIZ'])

describe('grid round engine', () => {
  it('normalizes reviewed words and selects deterministic 8-direction paths', () => {
    expect(normalizeRoundWord('  quiz ')).toBe('QUIZ')
    expect(findGridPath(grid, 'CAT')).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
    ])
    expect(findGridPath(grid, 'CAGE')).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 1, column: 2 },
      { row: 1, column: 3 },
    ])
  })

  it('does not reuse cells and treats QU as one cell consuming two letters', () => {
    expect(findGridPath([['A', 'B']], 'ABA')).toBeNull()
    expect(findGridPath(grid, 'QUIZ')).toEqual([
      { row: 3, column: 0 },
      { row: 3, column: 1 },
      { row: 3, column: 2 },
    ])
    expect(findGridPath([['Q', 'U']], 'QU')).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
    ])
    expect(findGridPath([['QU']], 'Q')).toBeNull()
  })

  it('retains all failure flags and cancels every self and cross-player duplicate', () => {
    const evaluation = evaluateGridRound(
      {
        mode: 'boggle',
        grid,
        submissions: [
          { playerId: 'p2', words: [{ word: 'cat' }, { word: 'dog' }, { word: 'DOG' }] },
          { playerId: 'p1', words: [{ word: ' CAT ' }, { word: 'x1' }] },
        ],
      },
      dictionary,
    )

    expect(evaluation.players.map((player) => player.playerId)).toEqual(['p1', 'p2'])
    expect(evaluation.players[0].words[0]).toMatchObject({
      normalized: 'CAT',
      valid: false,
      score: 0,
      failures: { crossPlayerDuplicate: true, selfDuplicate: false },
    })
    expect(evaluation.players[1].words.slice(1).map((word) => word.failures.selfDuplicate)).toEqual([false, true])
    expect(evaluation.players[0].words[1]).toMatchObject({
      normalized: 'X1',
      failures: {
        invalidCharacters: true,
        tooShort: true,
        notInDictionary: true,
        notOnBoard: true,
      },
    })
    expect(evaluation.playerTotals).toEqual({ p1: 0, p2: 1 })
  })

  it('applies audited dictionary/path overrides without erasing original failures', () => {
    const evaluation = evaluateGridRound(
      {
        mode: 'scribbage',
        grid,
        submissions: [
          {
            playerId: 'host',
            words: [
              {
                word: 'MADEUP',
                overrides: [
                  { check: 'dictionary', reason: ' House dictionary ' },
                  { check: 'path', reason: 'Board transcription correction', hostMemberId: 'host' },
                ],
              },
              { word: 'NO', overrides: [{ check: 'dictionary', reason: 'Allowed locally' }] },
            ],
          },
        ],
      },
      dictionary,
    )

    expect(evaluation.players[0].words[0]).toMatchObject({
      failures: { notInDictionary: true, notOnBoard: true },
      overridesApplied: [
        { check: 'dictionary', reason: 'House dictionary' },
        { check: 'path', reason: 'Board transcription correction' },
      ],
      valid: true,
      score: 3,
    })
    expect(evaluation.players[0].words[1]).toMatchObject({
      failures: { tooShort: true, notInDictionary: true },
      valid: false,
      score: 0,
    })
  })

  it.each([
    ['boggle', ['CAT', 'CATS', 'PLANE', 'PLANET', 'JOURNEY', 'NOTEBOOK'], [1, 1, 2, 3, 5, 11]],
    ['scribbage', ['CAT', 'CATS', 'PLANE', 'PLANET', 'JOURNEY', 'NOTEBOOK'], [0, 1, 2, 3, 5, 11]],
  ] as const)('uses %s score boundaries and derives player/round totals', (mode, words, expected) => {
    const longGrid = [
      ['C', 'A', 'T', 'S', 'X'],
      ['E', 'N', 'A', 'L', 'P'],
      ['J', 'O', 'U', 'R', 'N'],
      ['K', 'O', 'O', 'B', 'E'],
      ['A', 'B', 'C', 'D', 'T'],
    ]
    const allWords = new Set(words)
    const submissions = [{
      playerId: 'p1',
      words: words.map((word) => ({
        word,
        overrides: [{ check: 'path' as const, reason: 'Path fixture override' }],
      })),
    }]
    const evaluation = evaluateGridRound({ mode, grid: longGrid, submissions }, allWords)

    expect(evaluation.players[0].words.map((word) => word.score)).toEqual(expected)
    expect(evaluation.players[0].total).toBe(expected.reduce<number>((sum, score) => sum + score, 0))
    expect(evaluation.total).toBe(evaluation.players[0].total)
  })

  it('is independent of player submission order while retaining each player word order', () => {
    const p1 = { playerId: 'p1', playerName: 'Ada', words: [{ id: 'w1', word: 'DOG' }, { id: 'w2', word: 'CAT' }] }
    const p2 = { playerId: 'p2', playerName: 'Lin', words: [{ id: 'w3', word: 'PLAN' }] }
    const first: GridRoundSnapshot = { mode: 'boggle', grid, submissions: [p2, p1] }
    const second: GridRoundSnapshot = { mode: 'boggle', grid, submissions: [p1, p2] }

    expect(evaluateGridRound(first, dictionary)).toEqual(evaluateGridRound(second, dictionary))
    expect(evaluateGridRound(first, dictionary).players[0].words.map((word) => word.id)).toEqual(['w1', 'w2'])
  })

  it('rejects malformed grids and duplicate player submissions', () => {
    expect(() => evaluateGridRound({ mode: 'boggle', grid: [['A'], ['B', 'C']], submissions: [] }, dictionary))
      .toThrow('Grid rows must have the same length')
    expect(() => evaluateGridRound({
      mode: 'boggle',
      grid,
      submissions: [
        { playerId: 'p1', words: [] },
        { playerId: 'p1', words: [] },
      ],
    }, dictionary)).toThrow('Duplicate player submission: p1')
  })
})
