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
const getConnection = async (userId: string) => {
  const { data, error } = await admin().from('strava_connections').select('access_token').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as { access_token: string } | null
}

serve(async (request) => {
  if (isOptions(request)) return json(null)
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const user = await requireOwner(request)
    const connection = await getConnection(user.id)
    if (connection) {
      try {
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${connection.access_token}` },
        })
      } catch {
        // Delete the local connection even if Strava has already revoked the token.
      }
    }
    const { error } = await admin().from('strava_connections').delete().eq('user_id', user.id)
    if (error) throw error
    return json({ disconnected: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to disconnect Strava.' }, 400)
  }
})
