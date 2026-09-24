import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1'

const allowedEmail = 'miroslav.vicher@gmail.com'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }
const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders })
const isOptions = (request: Request) => request.method === 'OPTIONS'
const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })

async function requireOwner(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Error('Missing authorization token.')
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user || data.user.email?.toLowerCase() !== allowedEmail || data.user.app_metadata?.provider !== 'google') {
    throw new Error('Strava access is restricted to the GymLog owner.')
  }
  return data.user
}

async function getConnection(userId: string) {
  const { data, error } = await admin().from('strava_connections').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as { user_id: string; access_token: string; refresh_token: string; expires_at: string } | null
}

async function refreshToken(connection: { user_id: string; refresh_token: string }) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Strava token refresh failed: ${JSON.stringify(body)}`)
  const { data, error } = await admin().from('strava_connections').update({ access_token: body.access_token, refresh_token: body.refresh_token ?? connection.refresh_token, expires_at: new Date(Number(body.expires_at) * 1000).toISOString() }).eq('user_id', connection.user_id).select('*').single()
  if (error) throw error
  return data as { access_token: string; refresh_token: string; expires_at: string; user_id: string }
}

function xml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function buildTcx(workout: { start_time: string }, exercises: Array<{ name: string; sets: Array<{ weight: number; reps: number; performed_at: string }> }>): string {
  const laps = exercises.flatMap((exercise) => {
    const firstSet = exercise.sets[0]
    const lastSet = exercise.sets[exercise.sets.length - 1]
    const duration = Math.max(1, (new Date(lastSet.performed_at).getTime() - new Date(firstSet.performed_at).getTime()) / 1000)
    const description = exercise.sets.map((set) => `${set.weight} kg x ${set.reps}`).join(', ')
    return `<Lap StartTime="${xml(firstSet.performed_at)}"><TotalTimeSeconds>${duration}</TotalTimeSeconds><DistanceMeters>0</DistanceMeters><Notes>${xml(`${exercise.name}: ${description}`)}</Notes></Lap>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="WeightTraining"><Id>${xml(workout.start_time)}</Id>${laps}</Activity></Activities></TrainingCenterDatabase>`
}

serve(async (request) => {
  if (isOptions(request)) return new Response(null, { status: 204, headers: corsHeaders })
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const user = await requireOwner(request)
    const input = await request.json() as { workoutId?: number }
    const workoutId = Number(input.workoutId)
    if (!Number.isInteger(workoutId) || workoutId <= 0) return json({ error: 'A valid workoutId is required.' }, 400)

    const db = admin()
    const { data: existingLink, error: linkError } = await db.from('workout_strava_links').select('strava_activity_id').eq('user_id', user.id).eq('workout_id', workoutId).maybeSingle()
    if (linkError) throw linkError
    if (existingLink) return json({ uploaded: false, stravaActivityId: existingLink.strava_activity_id, alreadyUploaded: true })

    const [{ data: workout, error: workoutError }, { data: workoutExercises, error: exercisesError }] = await Promise.all([
      db.from('workouts').select('id,start_time').eq('id', workoutId).eq('user_id', user.id).single(),
      db.from('workout_exercises').select('id,exercise_id,exercise_order,exercises(name),workout_sets(weight,reps,performed_at,set_number)').eq('workout_id', workoutId).eq('user_id', user.id).order('exercise_order'),
    ])
    if (workoutError) throw workoutError
    if (exercisesError) throw exercisesError

    const exercises = (workoutExercises ?? []).map((entry) => ({
      name: (entry.exercises as { name?: string } | null)?.name ?? 'Exercise',
      sets: [...((entry.workout_sets as Array<{ weight: number; reps: number; performed_at: string; set_number: number }> | null) ?? [])].sort((a, b) => a.set_number - b.set_number),
    })).filter((entry) => entry.sets.length > 0)
    if (exercises.length === 0) return json({ error: 'Workout has no logged sets.' }, 400)

    let connection = await getConnection(user.id)
    if (!connection) return json({ error: 'Strava is not connected.' }, 404)
    if (new Date(connection.expires_at).getTime() <= Date.now() + 60_000) connection = await refreshToken(connection)

    const file = new Blob([buildTcx(workout, exercises)], { type: 'application/xml' })
    const form = new FormData()
    form.append('file', file, `gymlog-workout-${workoutId}.tcx`)
    form.append('data_type', 'tcx')
    form.append('sport_type', 'WeightTraining')
    form.append('name', `GymLog Workout ${new Date(workout.start_time).toISOString().slice(0, 10)}`)
    form.append('description', exercises.map((exercise) => `${exercise.name}: ${exercise.sets.map((set) => `${set.weight} kg x ${set.reps}`).join(', ')}`).join('\n'))
    const uploadResponse = await fetch('https://www.strava.com/api/v3/uploads', { method: 'POST', headers: { Authorization: `Bearer ${connection.access_token}` }, body: form })
    const uploadBody = await uploadResponse.json()
    if (!uploadResponse.ok) throw new Error(`Strava upload failed: ${JSON.stringify(uploadBody)}`)

    const stravaActivityId = Number(uploadBody.activity_id ?? uploadBody.id)
    if (!Number.isFinite(stravaActivityId)) throw new Error('Strava did not return an activity ID.')
    const { error: saveError } = await db.from('workout_strava_links').insert({ user_id: user.id, workout_id: workoutId, strava_activity_id: stravaActivityId })
    if (saveError) throw saveError
    return json({ uploaded: true, stravaActivityId })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to upload workout to Strava.' }, 400)
  }
})
