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

type Connection = { user_id: string; access_token: string; refresh_token: string; expires_at: string }
type WorkoutSet = { weight: number; reps: number; performed_at: string; set_number: number }
type WorkoutExercise = { exercise_order: number; exercises: { name?: string; strava_exercise_type?: string | null } | null; workout_sets: WorkoutSet[] | null }

type StravaSet = {
  exercise_type: string
  repetitions?: number
  weight?: number
  start_time?: string
}

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
  return data as Connection | null
}

async function refreshToken(connection: Connection) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Strava token refresh failed: ${JSON.stringify(body)}`)
  const { data, error } = await admin().from('strava_connections').update({ access_token: body.access_token, refresh_token: body.refresh_token ?? connection.refresh_token, expires_at: new Date(Number(body.expires_at) * 1000).toISOString() }).eq('user_id', connection.user_id).select('*').single()
  if (error) throw error
  return data as Connection
}

function buildStrengthTrainingJson(startTime: string, exercises: WorkoutExercise[]) {
  const sets: StravaSet[] = exercises
    .filter((exercise) => Boolean(exercise.exercises?.strava_exercise_type?.trim()))
    .sort((left, right) => left.exercise_order - right.exercise_order)
    .flatMap((exercise) => (exercise.workout_sets ?? [])
      .sort((left, right) => left.set_number - right.set_number)
      .map((set) => ({
        exercise_type: exercise.exercises!.strava_exercise_type!.trim(),
        repetitions: set.reps,
        weight: set.weight,
        start_time: new Date(set.performed_at).toISOString(),
      })))

  const start = new Date(startTime).getTime()
  const lastSetTime = sets.length > 0 ? new Date(sets[sets.length - 1].start_time!).getTime() : start
  return {
    version: '1.0',
    start_time: new Date(start).toISOString(),
    utc_offset: 0,
    elapsed_time: Math.max(1, Math.floor((lastSetTime - start) / 1000)),
    active_time: Math.max(1, Math.floor((lastSetTime - start) / 1000)),
    creator: { name: 'GymLog' },
    sets,
  }
}

async function uploadAndPoll(payload: Record<string, unknown>, accessToken: string, externalId: string) {
  const file = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const form = new FormData()
  form.append('file', file, `${externalId}.json`)
  form.append('data_type', 'json')
  form.append('sport_type', 'WeightTraining')
  form.append('activity_type', 'WeightTraining')
  form.append('trainer', '1')
  form.append('name', `GymLog Workout ${String(payload.start_time).slice(0, 10)}`)
  form.append('external_id', externalId)

  const uploadResponse = await fetch('https://www.strava.com/api/v3/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const upload = await uploadResponse.json() as { id?: number; id_str?: string; activity_id?: number; error?: string; status?: string }
  if (!uploadResponse.ok || upload.error) throw new Error(`Strava upload failed: ${JSON.stringify(upload)}`)
  if (!upload.id && !upload.id_str) throw new Error('Strava did not return an upload ID.')

  const uploadId = upload.id_str ?? String(upload.id)
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statusResponse = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const status = await statusResponse.json() as { activity_id?: number; error?: string; status?: string }
    if (!statusResponse.ok || status.error) throw new Error(`Strava upload processing failed: ${JSON.stringify(status)}`)
    if (status.activity_id) return status.activity_id
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Strava upload is still processing; retry status later.')
}

serve(async (request) => {
  if (isOptions(request)) return new Response(null, { status: 204, headers: corsHeaders })
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const user = await requireOwner(request)
    const input = await request.json() as { workoutId?: number; preview?: boolean }
    const workoutId = Number(input.workoutId)
    if (!Number.isInteger(workoutId) || workoutId <= 0) return json({ error: 'A valid workoutId is required.' }, 400)

    const db = admin()
    if (input.preview !== true) {
      const { data: existingLink, error: linkError } = await db.from('workout_strava_links').select('strava_activity_id').eq('user_id', user.id).eq('workout_id', workoutId).maybeSingle()
      if (linkError) throw linkError
      if (existingLink) return json({
        uploaded: false,
        stravaActivityId: existingLink.strava_activity_id,
        stravaUrl: `https://www.strava.com/activities/${existingLink.strava_activity_id}`,
        alreadyUploaded: true,
      })
    }

    const [{ data: workout, error: workoutError }, { data: workoutExercises, error: exercisesError }] = await Promise.all([
      db.from('workouts').select('id,start_time').eq('id', workoutId).eq('user_id', user.id).single(),
      db.from('workout_exercises').select('exercise_order,exercises(name,strava_exercise_type),workout_sets(weight,reps,performed_at,set_number)').eq('workout_id', workoutId).eq('user_id', user.id).order('exercise_order'),
    ])
    if (workoutError) throw workoutError
    if (exercisesError) throw exercisesError

    const exercises = (workoutExercises ?? []) as WorkoutExercise[]
    const payload = buildStrengthTrainingJson(workout.start_time, exercises)
    if (payload.sets.length === 0) return json({ error: 'Workout has no logged sets.' }, 400)

    if (input.preview === true) return json({ preview: true, workoutId, payload })

    let connection = await getConnection(user.id)
    if (!connection) return json({ error: 'Strava is not connected.' }, 404)
    if (new Date(connection.expires_at).getTime() <= Date.now() + 60_000) connection = await refreshToken(connection)

    const stravaActivityId = await uploadAndPoll(payload, connection.access_token, `gymlog-workout-${workoutId}`)
    const { error: saveError } = await db.from('workout_strava_links').insert({ user_id: user.id, workout_id: workoutId, strava_activity_id: stravaActivityId })
    if (saveError) throw saveError
    return json({ uploaded: true, stravaActivityId, stravaUrl: `https://www.strava.com/activities/${stravaActivityId}` })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to upload workout to Strava.' }, 400)
  }
})
