export type DefinitionMeaning = {
  partOfSpeech: string
  definitions: string[]
}

export type WordDefinition = {
  word: string
  phonetic: string | null
  meanings: DefinitionMeaning[]
}

export type DefinitionLookupOptions = {
  fetcher?: typeof fetch
  storage?: Storage | null
  apiBaseUrl?: string
  maxDefinitions?: number
}

const CACHE_PREFIX = 'wordwell:definition:v1:'
const DEFAULT_API_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/'

function normalizedWord(word: string) {
  return word.trim().toUpperCase()
}

function defaultStorage() {
  if (typeof localStorage === 'undefined') return null
  try {
    const probe = `${CACHE_PREFIX}probe`
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

function isWordDefinition(value: unknown): value is WordDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.word === 'string'
    && (typeof record.phonetic === 'string' || record.phonetic === null)
    && Array.isArray(record.meanings)
    && record.meanings.every((meaning) => {
      if (!meaning || typeof meaning !== 'object' || Array.isArray(meaning)) return false
      const item = meaning as Record<string, unknown>
      return typeof item.partOfSpeech === 'string'
        && Array.isArray(item.definitions)
        && item.definitions.every((definition) => typeof definition === 'string')
    })
}

function cachedDefinition(storage: Storage | null, word: string) {
  if (!storage) return null
  try {
    const value = storage.getItem(`${CACHE_PREFIX}${word}`)
    if (!value) return null
    const parsed = JSON.parse(value) as unknown
    return isWordDefinition(parsed) ? parsed : null
  } catch {
    return null
  }
}

function saveDefinition(storage: Storage | null, definition: WordDefinition) {
  if (!storage) return
  try {
    storage.setItem(`${CACHE_PREFIX}${definition.word}`, JSON.stringify(definition))
  } catch {
    // A definition remains usable for this view if browser storage is unavailable or full.
  }
}

export function parseDefinitionResponse(
  requestedWord: string,
  value: unknown,
  maxDefinitions = 3,
): WordDefinition | null {
  if (!Array.isArray(value) || maxDefinitions < 1) return null

  const word = normalizedWord(requestedWord)
  const grouped = new Map<string, string[]>()
  const seen = new Set<string>()
  let phonetic: string | null = null
  let total = 0

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
    const entry = rawEntry as Record<string, unknown>
    if (!phonetic && typeof entry.phonetic === 'string' && entry.phonetic.trim()) {
      phonetic = entry.phonetic.trim()
    }
    if (!phonetic && Array.isArray(entry.phonetics)) {
      const candidate = entry.phonetics.find((item) =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)
          && typeof (item as Record<string, unknown>).text === 'string'
          && String((item as Record<string, unknown>).text).trim()),
      ) as Record<string, unknown> | undefined
      if (candidate) phonetic = String(candidate.text).trim()
    }
    if (!Array.isArray(entry.meanings)) continue

    for (const rawMeaning of entry.meanings) {
      if (total >= maxDefinitions) break
      if (!rawMeaning || typeof rawMeaning !== 'object' || Array.isArray(rawMeaning)) continue
      const meaning = rawMeaning as Record<string, unknown>
      const partOfSpeech = typeof meaning.partOfSpeech === 'string' && meaning.partOfSpeech.trim()
        ? meaning.partOfSpeech.trim()
        : 'meaning'
      if (!Array.isArray(meaning.definitions)) continue

      for (const rawDefinition of meaning.definitions) {
        if (total >= maxDefinitions) break
        if (!rawDefinition || typeof rawDefinition !== 'object' || Array.isArray(rawDefinition)) continue
        const definition = (rawDefinition as Record<string, unknown>).definition
        if (typeof definition !== 'string' || !definition.trim()) continue
        const clean = definition.trim()
        const key = clean.toLocaleLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const definitions = grouped.get(partOfSpeech) ?? []
        definitions.push(clean)
        grouped.set(partOfSpeech, definitions)
        total += 1
      }
    }
  }

  if (total === 0) return null
  return {
    word,
    phonetic,
    meanings: [...grouped].map(([partOfSpeech, definitions]) => ({ partOfSpeech, definitions })),
  }
}

export async function lookupWordDefinition(
  requestedWord: string,
  options: DefinitionLookupOptions = {},
): Promise<WordDefinition | null> {
  const word = normalizedWord(requestedWord)
  if (!/^[A-Z]+$/.test(word)) return null

  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const cached = cachedDefinition(storage, word)
  if (cached) return cached

  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetcher) return null

  try {
    const baseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL
    const response = await fetcher(`${baseUrl}${encodeURIComponent(word.toLocaleLowerCase())}`)
    if (!response.ok) return null
    const definition = parseDefinitionResponse(
      word,
      await response.json(),
      options.maxDefinitions ?? 3,
    )
    if (definition) saveDefinition(storage, definition)
    return definition
  } catch {
    return null
  }
}
