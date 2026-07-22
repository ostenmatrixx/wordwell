import type { GameMode, WordResult } from '../types'

export function normalizeWord(word: string) {
  return word.trim().toUpperCase()
}

export function splitWords(input: string) {
  return input
    .split(/[\s,;]+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

export function scrabbleScore(_word: string) {
  return 0
}

export function boggleScore(word: string) {
  if (word.length < 3) return 0
  if (word.length <= 4) return 1
  if (word.length === 5) return 2
  if (word.length === 6) return 3
  if (word.length === 7) return 5
  return 11
}

export function scribbageScore(word: string) {
  if (word.length < 4) return 0
  if (word.length === 4) return 1
  if (word.length === 5) return 2
  if (word.length === 6) return 3
  if (word.length === 7) return 5
  return 11
}

export function scoreWord(word: string, mode: GameMode) {
  if (mode === 'scrabble') return scrabbleScore(word)
  if (mode === 'scribbage') return scribbageScore(word)
  return boggleScore(word)
}

export function checkWords(input: string, mode: GameMode, dictionary: ReadonlySet<string>): WordResult[] {
  const seen = new Set<string>()

  return splitWords(input).map((word) => {
    const normalized = normalizeWord(word)
    let reason: string | undefined

    if (!/^[A-Z]+$/.test(normalized)) reason = 'Letters only'
    else if (seen.has(normalized)) reason = 'Duplicate'
    else if (mode === 'boggle' && normalized.length < 3) reason = 'Too short'
    else if (mode === 'scribbage' && normalized.length < 4) reason = 'Too short'
    else if (!dictionary.has(normalized)) reason = 'Not in dictionary'

    seen.add(normalized)
    const valid = !reason

    return {
      word,
      normalized,
      valid,
      score: valid ? scoreWord(normalized, mode) : 0,
      reason,
    }
  })
}
