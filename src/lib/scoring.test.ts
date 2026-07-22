import { describe, expect, it } from 'vitest'
import { boggleScore, checkWords, scoreWord, scrabbleScore, scribbageScore, splitWords } from './scoring'

describe('word scoring', () => {
  it('leaves Scrabble scoring for manual input', () => {
    expect(scrabbleScore('QUIZ')).toBe(0)
    expect(scrabbleScore('MUZJIKS')).toBe(0)
    expect(scoreWord('QUIZ', 'scrabble')).toBe(0)
  })

  it.each([
    ['AT', 0],
    ['CAT', 1],
    ['WORD', 1],
    ['PLANE', 2],
    ['PLANET', 3],
    ['JOURNEY', 5],
    ['NOTEBOOK', 11],
    ['ABCDEFGHI', 11],
  ])('scores Boggle word %s as %i', (word, expected) => {
    expect(boggleScore(word)).toBe(expected)
    expect(scoreWord(word, 'boggle')).toBe(expected)
  })

  it.each([
    ['CAT', 0],
    ['QUIZ', 1],
    ['PLANE', 2],
    ['PLANET', 3],
    ['JOURNEY', 5],
    ['NOTEBOOK', 11],
    ['ABCDEFGHI', 11],
  ])('scores Scribbage word %s as %i', (word, expected) => {
    expect(scribbageScore(word)).toBe(expected)
    expect(scoreWord(word, 'scribbage')).toBe(expected)
  })

  it('splits batches separated by whitespace, commas, and semicolons', () => {
    expect(splitWords('cat, dog\ncat')).toEqual(['cat', 'dog', 'cat'])
    expect(splitWords('  cat;dog  bird ')).toEqual(['cat', 'dog', 'bird'])
  })

  it('checks Scrabble words against the dictionary without assigning scores', () => {
    const dictionary = new Set(['A', 'CAT', 'QUIZ'])

    expect(checkWords('a cat quiz nope', 'scrabble', dictionary)).toEqual([
      { word: 'a', normalized: 'A', valid: true, score: 0, reason: undefined },
      { word: 'cat', normalized: 'CAT', valid: true, score: 0, reason: undefined },
      { word: 'quiz', normalized: 'QUIZ', valid: true, score: 0, reason: undefined },
      { word: 'nope', normalized: 'NOPE', valid: false, score: 0, reason: 'Not in dictionary' },
    ])
  })

  it('checks Boggle minimum length, dictionary membership, and automatic scores', () => {
    const dictionary = new Set(['AT', 'CAT', 'WORD', 'PLANE', 'PLANET', 'JOURNEY', 'NOTEBOOK'])
    const results = checkWords('at cat word plane planet journey notebook', 'boggle', dictionary)

    expect(results.map(({ valid, score, reason }) => ({ valid, score, reason }))).toEqual([
      { valid: false, score: 0, reason: 'Too short' },
      { valid: true, score: 1, reason: undefined },
      { valid: true, score: 1, reason: undefined },
      { valid: true, score: 2, reason: undefined },
      { valid: true, score: 3, reason: undefined },
      { valid: true, score: 5, reason: undefined },
      { valid: true, score: 11, reason: undefined },
    ])
  })

  it('checks Scribbage minimum length, dictionary membership, and automatic scores', () => {
    const dictionary = new Set(['CAT', 'QUIZ', 'PLANE', 'PLANET', 'JOURNEY', 'NOTEBOOK'])
    const results = checkWords('cat quiz plane planet journey notebook nope', 'scribbage', dictionary)

    expect(results.map(({ valid, score, reason }) => ({ valid, score, reason }))).toEqual([
      { valid: false, score: 0, reason: 'Too short' },
      { valid: true, score: 1, reason: undefined },
      { valid: true, score: 2, reason: undefined },
      { valid: true, score: 3, reason: undefined },
      { valid: true, score: 5, reason: undefined },
      { valid: true, score: 11, reason: undefined },
      { valid: false, score: 0, reason: 'Not in dictionary' },
    ])
  })

  it('rejects non-letter input and repeated normalized words in every mode', () => {
    const dictionary = new Set(['QUIZ'])

    for (const mode of ['scrabble', 'boggle', 'scribbage'] as const) {
      const results = checkWords('quiz QUIZ q4iz', mode, dictionary)
      expect(results.map(({ valid, score, reason }) => ({ valid, score, reason }))).toEqual([
        { valid: true, score: mode === 'scrabble' ? 0 : 1, reason: undefined },
        { valid: false, score: 0, reason: 'Duplicate' },
        { valid: false, score: 0, reason: 'Letters only' },
      ])
    }
  })
})
