export type GameMode = 'scrabble' | 'boggle' | 'scribbage'

export type RoomPhase = 'lobby' | 'active' | 'complete'
export type RoundPhase = 'board_setup' | 'playing' | 'collecting' | 'processing' | 'review' | 'finalized'
export type ConnectionState = 'online' | 'offline' | 'reconnecting'
export type SubmissionState = 'draft' | 'queued' | 'submitted' | 'rejected' | 'empty'

export type GridCell = string
export type GridCoordinate = { row: number; col: number }

export type RoomMember = {
  id: string
  sessionId: string
  userId: string
  displayName: string
  isHost: boolean
  isPlayer: boolean
  playerOrder: number | null
  removedAt: string | null
}

export type GameRoom = {
  id: string
  mode: GameMode
  roomCode?: string
  phase: RoomPhase
  playerLimit: number
  lobbyLocked: boolean
  hostUserId: string
  members: RoomMember[]
  createdAt: string
  updatedAt: string
}

export type GameRound = {
  id: string
  sessionId: string
  number: number
  phase: RoundPhase
  gridSize: 4 | 5 | null
  grid: GridCell[][] | null
  timerSeconds: number
  remainingSeconds: number | null
  startedAt: string | null
  pausedAt: string | null
  closedAt: string | null
  finalizedAt: string | null
  frozenRevision: number
  resultsRevision: number
}

export type SubmissionReceipt = {
  id: string
  roundId: string
  memberId: string
  state: SubmissionState
  revision: number
  wordCount: number
  confirmedAt: string | null
}

export type EditableWord = {
  id: string
  raw: string
  normalized: string
  confidence?: number
}

export type WordResult = {
  word: string
  normalized: string
  valid: boolean
  score: number
  reason?: string
}

export type Player = {
  id: string
  name: string
  score: number
}

export type ScoreEntry = {
  id: string
  word: string
  points: number
  playerId: string
  createdAt: string
}

export type GameSession = {
  id: string
  mode: GameMode
  createdAt: string
  updatedAt: string
  players: Player[]
  entries: ScoreEntry[]
  status: 'active' | 'complete'
  syncStatus: 'pending' | 'synced' | 'local'
}
