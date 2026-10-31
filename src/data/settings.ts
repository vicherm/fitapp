import { createLocalRow, getLocalDatabase, listLocalRows, updateLocalRow } from '../db/local'
import { mapSettings } from './mappers'
import type { Settings } from '../db/types'

export const DEFAULT_SYNC_COOLDOWN = 3600

export async function getSettings(): Promise<Settings | null> {
  const rows = await listSettings()
  return rows[0] ?? null
}

export async function updateSettings(settings: Pick<Settings, 'gymDetectionRadius' | 'theme'> & Partial<Pick<Settings, 'syncCooldownSeconds'>>): Promise<Settings> {
  const db = getLocalDatabase()
  return db.transaction('rw', db.tables, async () => {
    const current = await getSettings()
    const input = { gym_detection_radius: settings.gymDetectionRadius, theme: settings.theme,
      sync_cooldown_seconds: settings.syncCooldownSeconds ?? current?.syncCooldownSeconds ?? DEFAULT_SYNC_COOLDOWN }
    return mapSettings(current
      ? await updateLocalRow('settings', current.id, input)
      : await createLocalRow('settings', { ...input, is_deleted: false }))
  })
}

export async function listSettings(includeDeleted = false): Promise<Settings[]> {
  return (await listLocalRows('settings', includeDeleted)).sort((a, b) => a.id.localeCompare(b.id)).map(mapSettings)
}
