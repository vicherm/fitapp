import { supabase } from '../lib/supabase'
import { dataTables, getLocalDatabase, type ServerSnapshot } from '../db/local'
import { manualSync, type SyncTransport } from '../db/sync'
import type { Json } from '../lib/database.types'

function parseSnapshot(value: Json): ServerSnapshot {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid sync response.')
  const snapshot = { ...value }
  for (const name of dataTables) {
    const rows = value[name]
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.id !== 'string' || typeof row.user_id !== 'string'
      || typeof row.is_deleted !== 'boolean' || typeof row.updated_at !== 'string'
      || typeof row.created_at !== 'string')) throw new Error(`Invalid sync response for ${name}.`)
    snapshot[name] = rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid sync row.')
      const { server_revision: _revision, ...fields } = row
      return fields
    })
  }
  return snapshot as ServerSnapshot
}

const transport: SyncTransport = {
  async push(snapshot) {
    const { data, error } = await supabase.rpc('push_local_changes', { changes: snapshot as Json })
    if (error) throw new Error(`Push failed: ${error.message}`)
    return parseSnapshot(data)
  },
  async pull(cursor) {
    const { data, error } = await supabase.rpc('pull_local_changes', { since_revision: cursor })
    if (error) throw new Error(`Pull failed: ${error.message}`)
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || typeof data.cursor !== 'string' || !/^(0|[1-9][0-9]*)$/.test(data.cursor)
      || data.data === undefined) throw new Error('Invalid incremental Pull response.')
    return { cursor: data.cursor, data: parseSnapshot(data.data) }
  },
}

export async function syncData() {
  const db = getLocalDatabase()
  let result
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (data.session?.user.id !== db.userId) throw new Error('Sign in to the account that owns this local database.')
    result = await manualSync('sync', transport)
  } catch (error) {
    try {
      await db.lastSyncMetadata().put({ key: 'last_sync', timestamp: new Date().toISOString(), status: 'BAD' })
    } catch (storageError) {
      throw new AggregateError([error, storageError], `Sync failed and its status could not be saved: ${error instanceof Error ? error.message : String(error)}; ${storageError instanceof Error ? storageError.message : String(storageError)}`)
    }
    throw error
  }
  try {
    await db.lastSyncMetadata().put({ key: 'last_sync', timestamp: new Date().toISOString(), status: 'OK' })
  } catch (error) {
    throw new Error(`Sync completed, but its status could not be saved: ${error instanceof Error ? error.message : String(error)}`)
  }
  return result
}
