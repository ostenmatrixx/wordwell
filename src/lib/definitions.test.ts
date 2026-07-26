import { describe, expect, it, vi } from 'vitest'
import { lookupWordDefinition, parseDefinitionResponse } from './definitions'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

const responseBody = [
  {
    phonetic: '/wɜːd/',
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          { definition: 'A meaningful unit of language.' },
          { definition: 'A meaningful unit of language.' },
        ],
      },
      {
        partOfSpeech: 'verb',
        definitions: [
          { definition: 'To express something carefully.' },
          { definition: 'To phrase a message.' },
        ],
      },
    ],
  },
]

describe('word definitions', () => {
  it('normalizes, groups, deduplicates, and caps API definitions', () => {
    expect(parseDefinitionResponse(' word ', responseBody, 2)).toEqual({
      word: 'WORD',
      phonetic: '/wɜːd/',
      meanings: [
        { partOfSpeech: 'noun', definitions: ['A meaningful unit of language.'] },
        { partOfSpeech: 'verb', definitions: ['To express something carefully.'] },
      ],
    })
  })

  it('caches successful lookups and reuses them without another request', async () => {
    const storage = memoryStorage()
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => responseBody,
    } as Response))

    const first = await lookupWordDefinition('word', { storage, fetcher })
    const second = await lookupWordDefinition('WORD', { storage, fetcher })

    expect(first).toEqual(second)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('https://api.dictionaryapi.dev/api/v2/entries/en/word')
  })

  it('returns null for missing, malformed, and failed responses without caching them', async () => {
    const storage = memoryStorage()
    const missing = vi.fn(async () => ({ ok: false, json: async () => ({}) } as Response))
    const malformed = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'No Definitions Found' }) } as Response))
    const failed = vi.fn(async () => { throw new Error('offline') })

    await expect(lookupWordDefinition('QI', { storage, fetcher: missing })).resolves.toBeNull()
    await expect(lookupWordDefinition('QI', { storage, fetcher: malformed })).resolves.toBeNull()
    await expect(lookupWordDefinition('QI', { storage, fetcher: failed })).resolves.toBeNull()
    expect(storage.length).toBe(0)
  })
})
