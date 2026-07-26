import { describe, expect, it } from 'vitest'
import {
  generateWordFactoryBoard,
  getWordFactoryCubes,
  rumbleBoardFromCubes,
} from './board-generator'

function fixedCube(face: string) {
  return [face, face, face, face, face, face] as const
}

describe('rumbled Word Factory boards', () => {
  it.each([4, 5] as const)('creates a valid %s by %s board', (size) => {
    const board = generateWordFactoryBoard(size, () => 0.25)

    expect(board).toHaveLength(size)
    expect(board.every((row) => row.length === size)).toBe(true)
    expect(board.flat().every((cell) => /^(?:[A-Z]|QU)$/.test(cell))).toBe(true)
  })

  it.each([4, 5] as const)('rumbles every physical cube exactly once on a %s by %s board', (size) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.slice(0, size * size).split('')
    const cubes = letters.map(fixedCube)
    const expected = letters.map((letter) => letter === 'Q' ? 'QU' : letter).sort()

    expect([...rumbleBoardFromCubes(cubes, size, () => 0).flat()].sort()).toEqual(expected)
  })

  it('shuffles cube positions before rolling their upward faces', () => {
    const letters = 'ABCDEFGHIJKLMNOP'.split('')
    const cubes = letters.map(fixedCube)

    expect(rumbleBoardFromCubes(cubes, 4, () => 0).flat()).not.toEqual(letters)
  })

  it('rolls one of the six real faces on each cube', () => {
    const cubes = Array.from({ length: 16 }, () => ['A', 'B', 'C', 'D', 'E', 'F'] as const)
    let randomCalls = 0
    const random = () => randomCalls++ < 15 ? 0 : 0.999

    expect(rumbleBoardFromCubes(cubes, 4, random).flat()).toEqual(Array(16).fill('F'))
  })

  it('treats a rolled Q face as one QU tile', () => {
    const cubes = Array.from({ length: 16 }, (_, index) => fixedCube(index === 0 ? 'Q' : 'A'))
    expect(rumbleBoardFromCubes(cubes, 4, () => 0).flat()).toContain('QU')
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

  it('uses a complete six-sided cube set for every supported board size', () => {
    expect(getWordFactoryCubes(4)).toHaveLength(16)
    expect(getWordFactoryCubes(5)).toHaveLength(25)
    expect(getWordFactoryCubes(4).every((cube) => cube.length === 6)).toBe(true)
    expect(getWordFactoryCubes(5).every((cube) => cube.length === 6)).toBe(true)
  })

  it('uses the fixed 25-cube physical-style inventory for a 5 by 5 rumble', () => {
    expect(getWordFactoryCubes(5).map((cube) => cube.map((face) => face === 'QU' ? 'Q' : face).join(''))).toEqual([
      'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
      'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCENST',
      'CEIILT', 'CEILPT', 'CEIPST', 'DDHNOT', 'DHHLOR',
      'DHLNOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU',
      'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU',
    ])
  })

  it('rejects malformed cubes and invalid random sources', () => {
    expect(() => rumbleBoardFromCubes([fixedCube('A')], 4, () => 0)).toThrow('requires 16 cubes')
    expect(() => rumbleBoardFromCubes(Array(16).fill(['A', 'A1', 'A', 'A', 'A', 'A']), 4, () => 0)).toThrow('Invalid cube faces')
    expect(() => rumbleBoardFromCubes(Array(16).fill(fixedCube('A')), 4, () => 1)).toThrow('Random source')
  })
})
