import { createClient } from '@supabase/supabase-js'

const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }

export async function GET(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
  if (!token) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: noStore })

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  const admins = new Set((process.env.ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean))
  if (!url || !key || admins.size === 0) {
    return Response.json({ error: 'Admin access is not configured.' }, { status: 503, headers: noStore })
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return Response.json({ error: 'Invalid session.' }, { status: 401, headers: noStore })
  if (!admins.has(data.user.id)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers: noStore })
  return Response.json({ ok: true, service: 'deckle-admin' }, { headers: noStore })
}
