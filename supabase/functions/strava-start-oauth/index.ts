import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1'

const allowedEmail = 'miroslav.vicher@gmail.com'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
const isOptions = (request: Request) => request.method === 'OPTIONS'
const base64Url = (bytes: Uint8Array) => {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const hmac = async (payload: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('STRAVA_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
}
const createOAuthState = async (userId: string) => {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600, nonce: crypto.randomUUID() })))
  return `${payload}.${await hmac(payload)}`
}
const requireOwner = async (request: Request) => {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) throw new Error('Missing authorization token.')
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: header } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user || data.user.email?.toLowerCase() !== allowedEmail || data.user.app_metadata?.provider !== 'google') throw new Error('Strava access is restricted to the GymLog owner.')
  return data.user
}

serve(async (request) => {
  if (isOptions(request)) return json(null)
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const user = await requireOwner(request)
    const redirectUri = env('STRAVA_REDIRECT_URI')
    const state = await createOAuthState(user.id)
    const params = new URLSearchParams({
      client_id: env('STRAVA_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: redirectUri,
      approval_prompt: 'auto',
      scope: 'read,activity:write',
      state,
    })
    return json({ authorizationUrl: `https://www.strava.com/oauth/authorize?${params}` })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to start Strava OAuth.' }, 400)
  }
})
