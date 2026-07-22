export type GridRoundMode = 'boggle' | 'scribbage'

export type GridCoordinate = {
  row: number
  column: number
}

export type OverrideableWordCheck = 'dictionary' | 'path'

export type WordCheckOverride = {
  check: OverrideableWordCheck
  reason: string
  hostMemberId?: string
  createdAt?: string
}

export type SubmittedRoundWord = {
  id?: string
  word: string
  overrides?: readonly WordCheckOverride[]
}

export type PlayerRoundSubmission = {
  playerId: string
  playerName?: string
  words: readonly SubmittedRoundWord[]
}

export type GridRoundSnapshot = {
  mode: GridRoundMode
  grid: readonly (readonly string[])[]
  submissions: readonly PlayerRoundSubmission[]
}

export type WordFailureFlags = {
  invalidCharacters: boolean
  selfDuplicate: boolean
  crossPlayerDuplicate: boolean
  tooShort: boolean
  notInDictionary: boolean
  notOnBoard: boolean
}

export type AppliedWordOverride = WordCheckOverride & {
  reason: string
}

export type WordEvaluation = {
  id: string
  sourceIndex: number
  word: string
  normalized: string
  failures: WordFailureFlags
  overridesApplied: AppliedWordOverride[]
  path: GridCoordinate[] | null
  valid: boolean
  score: number
}

export type PlayerRoundEvaluation = {
  playerId: string
  playerName?: string
  words: WordEvaluation[]
  total: number
}

export type GridRoundEvaluation = {
  mode: GridRoundMode
  grid: string[][]
  players: PlayerRoundEvaluation[]
  playerTotals: Record<string, number>
  total: number
}

type IndexedWord = {
  source: SubmittedRoundWord
  sourceIndex: number
  normalized: string
}

const LETTERS_ONLY = /^[A-Z]+$/

/** Normalizes user-entered and OCR text without changing internal characters. */
export function normalizeRoundWord(word: string) {
  return word.trim().toUpperCase()
}

function normalizeGrid(grid: GridRoundSnapshot['grid']) {
  if (grid.length === 0 || grid[0].length === 0) {
    throw new Error('Grid must contain at least one cell')
  }

  const width = grid[0].length
  const normalized = grid.map((row) => {
    if (row.length !== width) throw new Error('Grid rows must have the same length')

    return row.map((cell) => {
      const value = normalizeRoundWord(cell)
      if (!/^(?:[A-Z]|QU)$/.test(value)) {
        throw new Error(`Invalid grid cell: ${cell}`)
      }
      return value
    })
  })

  return normalized
}

/**
 * Finds the first board path in row-major order. Neighbours are visited from
 * top-left to bottom-right, making the selected path stable across clients.
 */
export function findGridPath(grid: readonly (readonly string[])[], word: string): GridCoordinate[] | null {
  if (!LETTERS_ONLY.test(word) || word.length === 0) return null

  const height = grid.length
  const width = grid[0]?.length ?? 0
  if (height === 0 || width === 0) return null

  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false))
  const path: GridCoordinate[] = []

  function visit(row: number, column: number, offset: number): boolean {
    if (row < 0 || row >= height || column < 0 || column >= width || visited[row][column]) {
      return false
    }

    const token = grid[row][column]
    if (!word.startsWith(token, offset)) return false

    const nextOffset = offset + token.length
    visited[row][column] = true
    path.push({ row, column })

    if (nextOffset === word.length) return true

    for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
      for (let columnDelta = -1; columnDelta <= 1; columnDelta += 1) {
        if (rowDelta === 0 && columnDelta === 0) continue
        if (visit(row + rowDelta, column + columnDelta, nextOffset)) return true
      }
    }

    path.pop()
    visited[row][column] = false
    return false
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (visit(row, column, 0)) return [...path]
    }
  }

  return null
}

function wordScore(word: string, mode: GridRoundMode) {
  if (mode === 'boggle' && word.length < 3) return 0
  if (mode === 'scribbage' && word.length < 4) return 0
  if (word.length <= 4) return 1
  if (word.length === 5) return 2
  if (word.length === 6) return 3
  if (word.length === 7) return 5
  return 11
}

function applicableOverrides(
  overrides: SubmittedRoundWord['overrides'],
  failures: Pick<WordFailureFlags, 'notInDictionary' | 'notOnBoard'>,
) {
  const applied = new Map<OverrideableWordCheck, AppliedWordOverride>()

  for (const override of overrides ?? []) {
    const reason = override.reason.trim()
    const failed = override.check === 'dictionary' ? failures.notInDictionary : failures.notOnBoard
    if (!failed || reason.length === 0 || applied.has(override.check)) continue
    applied.set(override.check, { ...override, reason })
  }

  return [...applied.values()].sort((left, right) => left.check.localeCompare(right.check))
}

/**
 * Evaluates a frozen round snapshot. Player results are sorted by player ID,
 * while each player's reviewed word order is retained.
 */
export function evaluateGridRound(
  snapshot: GridRoundSnapshot,
  dictionary: ReadonlySet<string>,
): GridRoundEvaluation {
  const grid = normalizeGrid(snapshot.grid)
  const playerIds = new Set<string>()

  const submissions = snapshot.submissions
    .map((submission) => {
      const playerId = submission.playerId.trim()
      if (!playerId) throw new Error('Every submission requires a player ID')
      if (playerIds.has(playerId)) throw new Error(`Duplicate player submission: ${playerId}`)
      playerIds.add(playerId)

      return {
        ...submission,
        playerId,
        indexedWords: submission.words.map((source, sourceIndex): IndexedWord => ({
          source,
          sourceIndex,
          normalized: normalizeRoundWord(source.word),
        })),
      }
    })
    .sort((left, right) => left.playerId.localeCompare(right.playerId))

  const playersByWord = new Map<string, Set<string>>()
  for (const submission of submissions) {
    for (const word of submission.indexedWords) {
      if (!word.normalized) continue
      const playerSet = playersByWord.get(word.normalized) ?? new Set<string>()
      playerSet.add(submission.playerId)
      playersByWord.set(word.normalized, playerSet)
    }
  }

  const players = submissions.map((submission): PlayerRoundEvaluation => {
    const seenByPlayer = new Set<string>()

    const words = submission.indexedWords.map(({ source, sourceIndex, normalized }): WordEvaluation => {
      const invalidCharacters = !LETTERS_ONLY.test(normalized)
      const path = invalidCharacters ? null : findGridPath(grid, normalized)
      const selfDuplicate = seenByPlayer.has(normalized)
      seenByPlayer.add(normalized)
      const failures: WordFailureFlags = {
        invalidCharacters,
        selfDuplicate,
        crossPlayerDuplicate: (playersByWord.get(normalized)?.size ?? 0) > 1,
        tooShort: normalized.length < (snapshot.mode === 'boggle' ? 3 : 4),
        notInDictionary: !dictionary.has(normalized),
        notOnBoard: path === null,
      }
      const overridesApplied = applicableOverrides(source.overrides, failures)
      const overriddenChecks = new Set(overridesApplied.map((override) => override.check))
      const valid =
        !failures.invalidCharacters &&
        !failures.selfDuplicate &&
        !failures.crossPlayerDuplicate &&
        !failures.tooShort &&
        (!failures.notInDictionary || overriddenChecks.has('dictionary')) &&
        (!failures.notOnBoard || overriddenChecks.has('path'))
      const score = valid ? wordScore(normalized, snapshot.mode) : 0

      return {
        id: source.id ?? `${submission.playerId}:${sourceIndex}`,
        sourceIndex,
        word: source.word,
        normalized,
        failures,
        overridesApplied,
        path,
        valid,
        score,
      }
    })

    return {
      playerId: submission.playerId,
      ...(submission.playerName === undefined ? {} : { playerName: submission.playerName }),
      words,
      total: words.reduce((sum, word) => sum + word.score, 0),
    }
  })

  const playerTotals = Object.fromEntries(players.map((player) => [player.playerId, player.total]))

  return {
    mode: snapshot.mode,
    grid,
    players,
    playerTotals,
    total: players.reduce((sum, player) => sum + player.total, 0),
  }
}
