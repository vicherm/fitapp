import { supabase } from '../lib/supabase'
import { getLocalDatabase } from '../db/local'

async function requireSyncedWorkout(workoutId: string): Promise<void> {
  const db = getLocalDatabase()
  const snapshot = await db.transaction('r', db.tables, () => db.snapshot())
  const workout = snapshot.workouts.find((row) => row.id === workoutId && !row.is_deleted)
  if (!workout) throw new Error('Workout not found on this device.')
  const entries = snapshot.workout_exercises.filter((row) => row.workout_id === workoutId)
  const entryIds = new Set(entries.map((row) => row.id))
  const exerciseIds = new Set(entries.map((row) => row.exercise_id))
  const related = [
    workout, ...entries,
    ...snapshot.workout_sets.filter((row) => entryIds.has(row.workout_exercise_id)),
    ...snapshot.exercises.filter((row) => exerciseIds.has(row.id)),
    ...snapshot.gyms.filter((row) => row.id === workout.gym_id),
  ]
  if (related.some((row) => row.sync_status !== 'synced')) {
    throw new Error('Press Push on Home before uploading or previewing this workout in Strava.')
  }
}

export async function uploadWorkoutToStrava(workoutId: string): Promise<{ uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number; stravaUrl?: string }> {
  await requireSyncedWorkout(workoutId)

  const { data: status, error: statusError } = await supabase.functions.invoke('strava-status', {
    body: {},
  })
  if (statusError) throw statusError

  const hasWriteScope = status?.connection?.scope
    ?.split(/[\s,]+/)
    .map((scope: string) => scope.trim())
    .includes('activity:write')

  if (!status?.connected || !hasWriteScope) {
    const { data: oauth, error: oauthError } = await supabase.functions.invoke('strava-start-oauth', {
      body: { returnTo: window.location.href },
    })
    if (oauthError) throw oauthError
    if (!oauth?.authorizationUrl) throw new Error('Strava authorization URL was not returned.')
    window.location.assign(oauth.authorizationUrl)
    return { uploaded: false }
  }

  const { data, error } = await supabase.functions.invoke('strava-upload-workout', {
    body: { workoutId },
  })
  if (error) {
    const context = 'context' in error ? error.context : undefined
    if (context instanceof Response) {
      const body = await context.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? error.message)
    }
    throw error
  }
  return data as { uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number; stravaUrl?: string }
}

export async function downloadWorkoutStravaJson(workoutId: string): Promise<void> {
  await requireSyncedWorkout(workoutId)
  const { data, error } = await supabase.functions.invoke('strava-upload-workout', {
    body: { workoutId, preview: true },
  })
  if (error) {
    const context = 'context' in error ? error.context : undefined
    if (context instanceof Response) {
      const body = await context.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? error.message)
    }
    throw error
  }

  const blob = new Blob([JSON.stringify(data.payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `gymlog-strava-workout-${workoutId}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
