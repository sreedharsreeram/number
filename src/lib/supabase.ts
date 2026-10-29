import { createClient, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null

export type Account = { id: string; email: string; name: string }
export type PracticeResult = { id: string; difficulty: number; won: boolean; guesses: number; duration_ms: number; played_at: string }

export function accountFromUser(user: User | null): Account | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    name: String(user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Player'),
  }
}

export async function loadResults(): Promise<PracticeResult[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('practice_results')
    .select('id,difficulty,won,guesses,duration_ms,played_at')
    .order('played_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}

export async function saveResult(result: { id: string; user_id: string; difficulty: number; won: boolean; guesses: number; duration_ms: number }): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('practice_results').upsert(result, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
}
