import type { GameSession } from '../types'

const HISTORY_KEY = 'wordwell:sessions:v2'
const ACTIVE_SESSION_KEY = 'wordwell:active-session:v1'
const DEVICE_KEY = 'wordwell:device:v1'

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(DEVICE_KEY, created)
  return created
}

export function loadHistory(): GameSession[] {
  try {
    const value = localStorage.getItem(HISTORY_KEY)
    return value ? (JSON.parse(value) as GameSession[]) : []
  } catch {
    return []
  }
}

export function saveHistory(sessions: GameSession[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, 40)))
}

export function mergeHistory(local: GameSession[], remote: GameSession[]) {
  const byId = new Map<string, GameSession>()

  for (const session of [...remote, ...local]) {
    const existing = byId.get(session.id)
    if (
      !existing ||
      session.syncStatus === 'pending' ||
      (existing.syncStatus !== 'pending' &&
        Date.parse(session.updatedAt) >= Date.parse(existing.updatedAt))
    ) {
      byId.set(session.id, session)
    }
  }

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 40)
}

export function loadActiveSession(): GameSession | null {
  try {
    const value = localStorage.getItem(ACTIVE_SESSION_KEY)
    return value ? (JSON.parse(value) as GameSession) : null
  } catch {
    return null
  }
}

export function saveActiveSession(session: GameSession) {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session))
}

export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY)
}
