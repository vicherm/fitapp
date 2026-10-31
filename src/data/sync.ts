import { supabase } from '../lib/supabase'
import { dataTables, getLocalDatabase, type ServerSnapshot } from '../db/local'
import { manualSync, type SyncTransport } from '../db/sync'
import type { Json } from '../lib/database.types'

function parseSnapshot(value: Json): ServerSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid sync response.')
  for (const name of dataTables) {
    const rows = value[name]
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.id !== 'string' || typeof row.user_id !== 'string'
      || typeof row.is_deleted !== 'boolean' || typeof row.updated_at !== 'string'
      || typeof row.created_at !== 'string')) throw new Error(`Invalid sync response for ${name}.`)
  }
  return value as ServerSnapshot
}

const transport: SyncTransport = {
  async push(snapshot) {
    const { data, error } = await supabase.rpc('push_local_changes', { changes: snapshot as Json })
    if (error) throw new Error(`Push failed: ${error.message}`)
    return parseSnapshot(data)
  },
  async pull() {
    const { data, error } = await supabase.rpc('pull_local_snapshot')
    if (error) throw new Error(`Pull failed: ${error.message}`)
    return parseSnapshot(data)
  },
}

export async function syncData(direction: 'push' | 'pull') {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session?.user.id !== getLocalDatabase().userId) throw new Error('Sign in to the account that owns this local database.')
  return manualSync(direction, transport)
}
