import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1'

const allowedEmail = 'miroslav.vicher@gmail.com'
const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url } })
const isOptions = (request: Request) => request.method === 'OPTIONS'
const supabaseAdmin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
const base64Url = (bytes: Uint8Array) => {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const decodeBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
const hmac = async (payload: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('STRAVA_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
}
const verifyOAuthState = async (value: string) => {
  const [payload, signature] = value.split('.')
  if (!payload || !signature || signature !== await hmac(payload)) throw new Error('Invalid OAuth state.')
  const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { sub?: string; exp?: number }
  if (!parsed.sub || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error('Expired OAuth state.')
  return { sub: parsed.sub, exp: parsed.exp }
}
const requireOwnerById = async (userId: string) => {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId)
  if (error || !data.user || data.user.email?.toLowerCase() !== allowedEmail || data.user.app_metadata?.provider !== 'google') throw new Error('Strava access is restricted to the GymLog owner.')
  return data.user
}
const exchangeAuthorizationCode = async (code: string) => {
  const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), code, grant_type: 'authorization_code' }) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Strava token exchange failed: ${JSON.stringify(body)}`)
  return body as Record<string, unknown>
}
const frontendRedirect = () => env('STRAVA_FRONTEND_REDIRECT_URI')

function resultRedirect(status: string, detail?: string): Response {
  const url = new URL(frontendRedirect())
  url.searchParams.set('strava', status)
  if (detail) url.searchParams.set('message', detail)
  return redirect(url.toString())
}

serve(async (request) => {
  if (isOptions(request)) return new Response(null, { status: 204 })
  const requestUrl = new URL(request.url)
  const oauthError = requestUrl.searchParams.get('error')
  if (oauthError) return resultRedirect('error', oauthError)

  try {
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    if (!code || !state) return resultRedirect('error', 'Missing OAuth code or state.')

    const stateData = await verifyOAuthState(state)
    const user = await requireOwnerById(stateData.sub)
    const tokenData = await exchangeAuthorizationCode(code)
    const athlete = tokenData.athlete as Record<string, unknown> | undefined
    const accessToken = String(tokenData.access_token ?? '')
    const refreshToken = String(tokenData.refresh_token ?? '')
    const expiresAt = Number(tokenData.expires_at)
    const athleteId = Number(athlete?.id)
    if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || !Number.isFinite(athleteId)) {
      throw new Error('Strava returned an incomplete token response.')
    }

    const athleteName = [athlete?.firstname, athlete?.lastname].filter(Boolean).join(' ') || null
    const scopes = Array.isArray(tokenData.scope) ? tokenData.scope.join(',') : String(tokenData.scope ?? '')
    const { error } = await supabaseAdmin().from('strava_connections').upsert({
      user_id: user.id,
      strava_athlete_id: athleteId,
      strava_athlete_name: athleteName,
      scope: scopes,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw error
    return resultRedirect('connected')
  } catch (error) {
    return resultRedirect('error', error instanceof Error ? error.message : 'Strava OAuth failed.')
  }
})
