import { createClient } from '@supabase/supabase-js'
import type { GameSession } from '../types'
import { getDeviceId } from './storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

async function getUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  if (data.session?.user.id) return data.session.user.id

  const { data: anonymous, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return anonymous.user?.id ?? null
}

export async function pushSession(session: GameSession) {
  if (!supabase) return false
  const userId = await getUserId()
  if (!userId) return false

  const { error } = await supabase.from('game_sessions').upsert({
    id: session.id,
    user_id: userId,
    device_id: getDeviceId(),
    mode: session.mode,
    players: session.players,
    entries: session.entries,
    status: session.status,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  })
  if (error) throw error
  return true
}

export async function fetchSessions(): Promise<GameSession[]> {
  if (!supabase) return []
  const userId = await getUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from('game_sessions')
    .select('id,mode,players,entries,status,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(40)

  if (error) throw error
  return (data ?? []).map((session) => ({
    id: session.id,
    mode: session.mode,
    players: session.players,
    entries: session.entries,
    status: session.status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    syncStatus: 'synced',
  }))
}
