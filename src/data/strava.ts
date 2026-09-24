import { supabase } from '../lib/supabase'

export async function uploadWorkoutToStrava(workoutId: number): Promise<{ uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number }> {
  const { data, error } = await supabase.functions.invoke('strava-upload-workout', {
    body: { workoutId },
  })
  if (error) throw error
  return data as { uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number }
}
