import type { RoomState } from './rooms'

export type GameSummaryPlayer = {
  memberId: string
  displayName: string
  rank: number
  totalPoints: number
  scoredWordCount: number
  bestScore: number | null
  bestWords: string[]
}

type ScoringPlay = {
  word: string
  points: number
}

export function buildGameSummary(room: RoomState): GameSummaryPlayer[] {
  const players = room.members.filter((member) => member.isPlayer && !member.removedAt)
  const plays = new Map(players.map((player) => [player.id, [] as ScoringPlay[]]))

  if (room.session.mode === 'scrabble') {
    for (const entry of room.scoreEntries) {
      if (entry.voidedAt || entry.points <= 0 || !plays.has(entry.memberId)) continue
      plays.get(entry.memberId)?.push({ word: entry.word, points: entry.points })
    }
  } else {
    const finalizedRoundIds = new Set(
      room.rounds.filter((round) => round.phase === 'finalized').map((round) => round.id),
    )
    const wordsById = new Map(room.words.map((word) => [word.id, word]))
    const submissionsById = new Map(room.submissions.map((submission) => [submission.id, submission]))

    for (const result of room.results) {
      if (!finalizedRoundIds.has(result.roundId) || !result.eligible || result.score <= 0) continue
      const word = wordsById.get(result.wordId)
      const submission = word ? submissionsById.get(word.submissionId) : null
      if (!word || !submission || !plays.has(submission.memberId)) continue
      plays.get(submission.memberId)?.push({ word: word.normalized, points: result.score })
    }
  }

  const ranked = players
    .map((player) => {
      const playerPlays = plays.get(player.id) ?? []
      const totalPoints = playerPlays.reduce((total, play) => total + play.points, 0)
      const bestScore = playerPlays.length
        ? Math.max(...playerPlays.map((play) => play.points))
        : null
      const bestWords = bestScore === null
        ? []
        : [...new Set(
          playerPlays
            .filter((play) => play.points === bestScore)
            .map((play) => play.word),
        )].sort((left, right) => left.localeCompare(right))

      return {
        memberId: player.id,
        displayName: player.displayName,
        rank: 0,
        totalPoints,
        scoredWordCount: playerPlays.length,
        bestScore,
        bestWords,
      }
    })
    .sort((left, right) =>
      right.totalPoints - left.totalPoints
      || left.displayName.localeCompare(right.displayName),
    )

  let previousTotal: number | null = null
  let rank = 0
  return ranked.map((player, index) => {
    if (previousTotal === null || player.totalPoints !== previousTotal) rank = index + 1
    previousTotal = player.totalPoints
    return { ...player, rank }
  })
}
