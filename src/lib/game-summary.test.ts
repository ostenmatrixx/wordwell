import { describe, expect, it } from 'vitest'
import { buildGameSummary } from './game-summary'
import type { RoomMember, RoomSession, RoomState } from './rooms'

function session(mode: RoomSession['mode']): RoomSession {
  return {
    id: 'session',
    mode,
    boardSource: 'physical',
    playerLimit: 4,
    lobbyLocked: true,
    scrabbleTurnOrder: [],
    scrabbleTurnIndex: 0,
    scrabbleTurnNumber: 0,
    scrabblePendingWord: null,
    status: 'complete',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    finishedAt: '2026-01-01',
  }
}

function member(id: string, displayName: string, isPlayer = true): RoomMember {
  return {
    id,
    sessionId: 'session',
    userId: `user-${id}`,
    displayName,
    isHost: id === 'a',
    isPlayer,
    sortOrder: 0,
    joinedAt: '2026-01-01',
    removedAt: null,
  }
}

function emptyRoom(mode: RoomSession['mode']): RoomState {
  return {
    session: session(mode),
    members: [member('a', 'Ari'), member('b', 'Bea'), member('c', 'Cy'), member('host', 'Host', false)],
    rounds: [],
    submissions: [],
    words: [],
    results: [],
    overrides: [],
    scoreEntries: [],
  }
}

describe('final game summary', () => {
  it('ranks Scrabble ties and excludes voided entries and spectators', () => {
    const room = emptyRoom('scrabble')
    room.scoreEntries = [
      { id: '1', sessionId: 'session', memberId: 'a', word: 'CAT', points: 10, createdAt: '1', voidedAt: null, voidedBy: null, voidReason: null },
      { id: '2', sessionId: 'session', memberId: 'a', word: 'DOG', points: 5, createdAt: '2', voidedAt: null, voidedBy: null, voidReason: null },
      { id: '3', sessionId: 'session', memberId: 'b', word: 'QUIZ', points: 15, createdAt: '3', voidedAt: null, voidedBy: null, voidReason: null },
      { id: '4', sessionId: 'session', memberId: 'b', word: 'VOID', points: 99, createdAt: '4', voidedAt: '5', voidedBy: 'host', voidReason: 'Correction' },
      { id: '5', sessionId: 'session', memberId: 'host', word: 'NOPE', points: 50, createdAt: '5', voidedAt: null, voidedBy: null, voidReason: null },
    ]

    expect(buildGameSummary(room)).toEqual([
      { memberId: 'a', displayName: 'Ari', rank: 1, totalPoints: 15, scoredWordCount: 2, bestScore: 10, bestWords: ['CAT'] },
      { memberId: 'b', displayName: 'Bea', rank: 1, totalPoints: 15, scoredWordCount: 1, bestScore: 15, bestWords: ['QUIZ'] },
      { memberId: 'c', displayName: 'Cy', rank: 3, totalPoints: 0, scoredWordCount: 0, bestScore: null, bestWords: [] },
    ])
  })

  it('uses only positive eligible results from finalized grid rounds and keeps tied best words', () => {
    const room = emptyRoom('boggle')
    room.rounds = [
      {
        id: 'r1', sessionId: 'session', roundNumber: 1, gridSize: 4, grid: [], phase: 'finalized',
        timerDurationSeconds: 180, timerRemainingSeconds: 0, timerStartedAt: null, timerPausedAt: null,
        frozenRevision: null, resultsRevision: null, createdAt: '1', startedAt: null, closedAt: null, finalizedAt: '2',
      },
      {
        id: 'r2', sessionId: 'session', roundNumber: 2, gridSize: 4, grid: [], phase: 'review',
        timerDurationSeconds: 180, timerRemainingSeconds: 0, timerStartedAt: null, timerPausedAt: null,
        frozenRevision: null, resultsRevision: null, createdAt: '2', startedAt: null, closedAt: null, finalizedAt: null,
      },
    ]
    room.submissions = [
      { id: 's1', roundId: 'r1', memberId: 'a', clientToken: 't1', revision: 1, status: 'confirmed', confirmedAt: '1', updatedAt: '1' },
      { id: 's2', roundId: 'r2', memberId: 'b', clientToken: 't2', revision: 1, status: 'confirmed', confirmedAt: '1', updatedAt: '1' },
    ]
    room.words = [
      { id: 'w1', submissionId: 's1', position: 0, rawText: 'CAT', normalized: 'CAT', confidence: null },
      { id: 'w2', submissionId: 's1', position: 1, rawText: 'DOG', normalized: 'DOG', confidence: null },
      { id: 'w3', submissionId: 's1', position: 2, rawText: 'DUP', normalized: 'DUP', confidence: null },
      { id: 'w4', submissionId: 's2', position: 0, rawText: 'LATE', normalized: 'LATE', confidence: null },
    ]
    const result = (id: string, roundId: string, score: number, eligible: boolean) => ({
      id: `result-${id}`, roundId, wordId: id, resultsRevision: 'revision',
      formatValid: true, minimumLengthValid: true, dictionaryValid: true, gridValid: true,
      selfDuplicate: false, crossPlayerDuplicate: !eligible, gridPath: null, baseScore: score, score, eligible,
    })
    room.results = [
      result('w1', 'r1', 2, true),
      result('w2', 'r1', 2, true),
      result('w3', 'r1', 0, false),
      result('w4', 'r2', 11, true),
    ]

    expect(buildGameSummary(room)[0]).toEqual({
      memberId: 'a',
      displayName: 'Ari',
      rank: 1,
      totalPoints: 4,
      scoredWordCount: 2,
      bestScore: 2,
      bestWords: ['CAT', 'DOG'],
    })
    expect(buildGameSummary(room).slice(1).map(({ rank, totalPoints }) => ({ rank, totalPoints }))).toEqual([
      { rank: 2, totalPoints: 0 },
      { rank: 2, totalPoints: 0 },
    ])
  })
})
