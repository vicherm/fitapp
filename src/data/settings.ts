import { supabase } from '../lib/supabase'
import { mapSettings } from './mappers'
import type { Settings } from '../db/types'

export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await supabase.from('settings').select('*').order('id').maybeSingle()
  if (error) throw error
  return data ? mapSettings(data) : null
}

export async function updateSettings(settings: Pick<Settings, 'gymDetectionRadius' | 'theme'>): Promise<Settings> {
  const current = await getSettings()
  const payload = {
    gym_detection_radius: settings.gymDetectionRadius,
    theme: settings.theme,
  }

  const query = current?.id
    ? supabase.from('settings').update(payload).eq('id', current.id).select('*').single()
    : supabase.from('settings').insert(payload).select('*').single()
  const { data, error } = await query
  if (error) throw error
  return mapSettings(data)
}

export async function listSettings(): Promise<Settings[]> {
  const { data, error } = await supabase.from('settings').select('*').order('id')
  if (error) throw error
  return data.map(mapSettings)
}