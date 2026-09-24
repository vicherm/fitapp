import { supabase } from '../lib/supabase'

export async function uploadWorkoutToStrava(workoutId: number): Promise<{ uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number }> {
  const { data, error } = await supabase.functions.invoke('strava-upload-workout', {
    body: { workoutId },
  })
  if (error) throw error
  return data as { uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number }
}

export async function downloadWorkoutStravaJson(workoutId: number): Promise<void> {
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
