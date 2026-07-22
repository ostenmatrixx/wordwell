import { describe, expect, it } from 'vitest'
import {
  generateBoardFromDice,
  generateWordFactoryBoard,
  getWordFactoryDice,
} from './board-generator'

describe('generated Word Factory boards', () => {
  it.each([4, 5] as const)('creates a valid %s by %s board', (size) => {
    const board = generateWordFactoryBoard(size, () => 0.25)

    expect(board).toHaveLength(size)
    expect(board.every((row) => row.length === size)).toBe(true)
    expect(board.flat().every((cell) => /^(?:[A-Z]|QU)$/.test(cell))).toBe(true)
  })

  it.each([4, 5] as const)('rolls every die exactly once on a %s by %s board', (size) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.slice(0, size * size).split('')
    const dice = letters.map((letter) => letter.repeat(6))
    const expected = letters.map((letter) => letter === 'Q' ? 'QU' : letter).sort()

    expect([...generateBoardFromDice(dice, size, () => 0).flat()].sort()).toEqual(expected)
  })

  it('treats a rolled Q face as one QU tile', () => {
    const dice = Array.from({ length: 16 }, (_, index) => index === 0 ? 'Q' : 'A')
    expect(generateBoardFromDice(dice, 4, () => 0).flat()).toContain('QU')
  })

  it('is deterministic with an injected random source', () => {
    const values = [0.01, 0.2, 0.4, 0.6, 0.8]
    const makeRandom = () => {
      let index = 0
      return () => values[index++ % values.length]
    }

    expect(generateWordFactoryBoard(5, makeRandom())).toEqual(generateWordFactoryBoard(5, makeRandom()))
  })

  it('produces varied rolls with the production random source', () => {
    const boards = new Set(Array.from({ length: 6 }, () => JSON.stringify(generateWordFactoryBoard(4))))
    expect(boards.size).toBeGreaterThan(1)
  })

  it('uses a complete fixed dice set for every supported board size', () => {
    expect(getWordFactoryDice(4)).toHaveLength(16)
    expect(getWordFactoryDice(5)).toHaveLength(25)
  })

  it('rejects malformed dice and invalid random sources', () => {
    expect(() => generateBoardFromDice(['A'], 4, () => 0)).toThrow('requires 16 dice')
    expect(() => generateBoardFromDice(Array(16).fill('A1'), 4, () => 0)).toThrow('Invalid die faces')
    expect(() => generateBoardFromDice(Array(16).fill('A'), 4, () => 1)).toThrow('Random source')
  })
})
