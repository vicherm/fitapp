import { supabase } from '../lib/supabase'

export async function uploadWorkoutToStrava(workoutId: number): Promise<{ uploaded: boolean; alreadyUploaded?: boolean; stravaActivityId?: number; stravaUrl?: string }> {

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
