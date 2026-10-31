import {
  dataTables, getLocalDatabase, validateSnapshot,
  type DataTable, type LocalDatabase, type LocalRow, type ServerRow, type ServerSnapshot,
} from './local'

export interface SyncTransport {
  push(snapshot: ServerSnapshot): Promise<ServerSnapshot>
  pull(): Promise<ServerSnapshot>
}

export interface SyncResult {
  records: number
  keptLocal: number
}

export function emptyServerSnapshot(): ServerSnapshot {
  return { settings: [], body_part_groups: [], gyms: [], exercises: [], workouts: [], workout_exercises: [], workout_sets: [] }
}

function checkedRow<T extends DataTable>(row: ServerRow<T>): ServerRow<T> {
  timestampValue(row.created_at)
  timestampValue(row.updated_at)
  return row
}

function timestampValue(value: string): bigint {
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid synchronization timestamp.')
  const fraction = value.match(/\.(\d+)/)?.[1] ?? ''
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, '0').slice(3, 9))
}

export async function pullIntoLocal(db: LocalDatabase, incoming: ServerSnapshot): Promise<SyncResult> {
  return db.transaction('rw', db.tables, async () => {
    let records = 0
    let keptLocal = 0
    async function merge<T extends DataTable>(name: T) {
      for (const raw of incoming[name]) {
        const row = checkedRow(raw)
        const local = await db.rows(name).get(row.id)
        if (local && timestampValue(local.updated_at) > timestampValue(row.updated_at)) {
          keptLocal += 1
          continue
        }
        await db.rows(name).put({ ...row, sync_status: 'synced' })
        records += 1
      }
    }
    for (const name of dataTables) await merge(name)
    validateSnapshot(await db.snapshot(), db.userId)
    return { records, keptLocal }
  })
}

export async function pushFromLocal(db: LocalDatabase, transport: SyncTransport): Promise<SyncResult> {
  const pending = await db.transaction('r', db.tables, async () => {
    const snapshot = await db.snapshot()
    validateSnapshot(snapshot, db.userId)
    const collect = <R extends { sync_status: string }>(rows: R[]) =>
      rows.filter((row) => row.sync_status === 'pending').map(({ sync_status: _status, ...row }) => row)
    return {
      settings: collect(snapshot.settings),
      body_part_groups: collect(snapshot.body_part_groups),
      gyms: collect(snapshot.gyms),
      exercises: collect(snapshot.exercises),
      workouts: collect(snapshot.workouts),
      workout_exercises: collect(snapshot.workout_exercises),
      workout_sets: collect(snapshot.workout_sets),
    }
  })
  if (!Object.values(pending).some((rows) => rows.length > 0)) return { records: 0, keptLocal: 0 }
  const response = await transport.push(pending)
  return db.transaction('rw', db.tables, async () => {
    let records = 0
    let keptLocal = 0
    async function acknowledge<T extends DataTable>(name: T) {
      const replies = new Map(response[name].map((row) => [row.id, checkedRow(row)]))
      for (const sent of pending[name]) {
        const reply = replies.get(sent.id)
        if (!reply) throw new Error(`Push did not acknowledge ${name} record ${sent.id}. Pending changes were retained.`)
        const current = await db.rows(name).get(sent.id)
        if (!current) continue
        if (timestampValue(current.updated_at) > timestampValue(reply.updated_at)) {
          keptLocal += 1
          continue
        }
        const saved: LocalRow<T> = { ...reply, sync_status: 'synced' }
        await db.rows(name).put(saved)
        records += 1
      }
    }
    for (const name of dataTables) await acknowledge(name)
    validateSnapshot(await db.snapshot(), db.userId)
    return { records, keptLocal }
  })
}

let syncRunning = false

export async function manualSync(direction: 'push' | 'pull', transport: SyncTransport): Promise<SyncResult> {
  if (syncRunning) throw new Error('A sync operation is already running.')
  syncRunning = true
  try {
    const db = getLocalDatabase()
    return direction === 'push'
      ? await pushFromLocal(db, transport)
      : await pullIntoLocal(db, await transport.pull())
  } finally {
    syncRunning = false
  }
}
