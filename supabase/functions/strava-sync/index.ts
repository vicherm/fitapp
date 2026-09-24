import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1'

const allowedEmail = 'miroslav.vicher@gmail.com'
const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' } })
const isOptions = (request: Request) => request.method === 'OPTIONS'
const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
const requireOwner = async (request: Request) => {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) throw new Error('Missing authorization token.')
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: header } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user || data.user.email?.toLowerCase() !== allowedEmail || data.user.app_metadata?.provider !== 'google') throw new Error('Strava access is restricted to the GymLog owner.')
  return data.user
}
type Connection = { user_id: string; access_token: string; refresh_token: string; expires_at: string }
const getConnection = async (userId: string) => {
  const { data, error } = await admin().from('strava_connections').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as Connection | null
}
const refreshStravaToken = async (connection: Connection) => {
  const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Strava token refresh failed: ${JSON.stringify(body)}`)
  const { data, error } = await admin().from('strava_connections').update({ access_token: body.access_token, refresh_token: body.refresh_token ?? connection.refresh_token, expires_at: new Date(Number(body.expires_at) * 1000).toISOString() }).eq('user_id', connection.user_id).select('*').single()
  if (error) throw error
  return data as Connection
}
const stravaApi = async (path: string, accessToken: string) => {
  const response = await fetch(`https://www.strava.com/api/v3${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await response.json()
  if (!response.ok) throw new Error(`Strava API request failed (${response.status}): ${JSON.stringify(body)}`)
  return body
}

function activityRow(userId: string, activity: Record<string, unknown>) {
  return {
    user_id: userId,
    strava_activity_id: Number(activity.id),
    name: String(activity.name ?? 'Unnamed activity'),
    sport_type: activity.sport_type ?? activity.type ?? null,
    start_date: String(activity.start_date ?? activity.start_date_local),
    elapsed_time_seconds: activity.elapsed_time == null ? null : Number(activity.elapsed_time),
    moving_time_seconds: activity.moving_time == null ? null : Number(activity.moving_time),
    distance_meters: activity.distance == null ? null : Number(activity.distance),
    elevation_gain_meters: activity.total_elevation_gain == null ? null : Number(activity.total_elevation_gain),
    raw_payload: activity,
  }
}

serve(async (request) => {
  if (isOptions(request)) return json(null)
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const user = await requireOwner(request)
    let connection = await getConnection(user.id)
    if (!connection) return json({ error: 'Strava is not connected.' }, 404)

    if (new Date(connection.expires_at).getTime() <= Date.now() + 60_000) {
      connection = await refreshStravaToken(connection)
    }

    const input = await request.json().catch(() => ({})) as { after?: number; maxPages?: number }
    const maxPages = Math.min(Math.max(Number(input.maxPages ?? 10), 1), 10)
    const rows: ReturnType<typeof activityRow>[] = []
    for (let page = 1; page <= maxPages; page += 1) {
      const params = new URLSearchParams({ page: String(page), per_page: '100' })
      if (input.after) params.set('after', String(input.after))
      const activities = await stravaApi(`/athlete/activities?${params}`, connection.access_token) as Record<string, unknown>[]
      if (!Array.isArray(activities) || activities.length === 0) break
      rows.push(...activities.map((activity) => activityRow(user.id, activity)))
      if (activities.length < 100) break
    }

    if (rows.length > 0) {
      const { error } = await admin()
        .from('strava_activities')
        .upsert(rows, { onConflict: 'user_id,strava_activity_id' })
      if (error) throw error
    }
    return json({ imported: rows.length })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to sync Strava activities.' }, 400)
  }
})
