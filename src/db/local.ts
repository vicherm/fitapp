import Dexie, { type Table } from 'dexie'
import type { Database } from '../lib/database.types'

export const dataTables = [
  'settings', 'body_part_groups', 'gyms', 'exercises',
  'workouts', 'workout_exercises', 'workout_sets',
] as const

export type DataTable = typeof dataTables[number]
type RowMetadata = Pick<Database['public']['Tables']['settings']['Row'], 'id' | 'user_id' | 'created_at' | 'updated_at'>
type RowFields = { [T in DataTable]: Omit<Database['public']['Tables'][T]['Row'], keyof RowMetadata> }
export type ServerRow<T extends DataTable> = RowFields[T] & RowMetadata
export type LocalRow<T extends DataTable> = ServerRow<T> & { sync_status: 'pending' | 'synced' }
export type LocalSnapshot = { [T in DataTable]: LocalRow<T>[] }
export type ServerSnapshot = { [T in DataTable]: ServerRow<T>[] }
type RowInput<T extends DataTable> = RowFields[T]

export class LocalDatabase extends Dexie {
  readonly userId: string

  constructor(userId: string) {
    super(`gymlog-${userId}`)
    this.userId = userId
    this.version(1).stores({
      settings: 'id, sync_status',
      body_part_groups: 'id, sync_status',
      gyms: 'id, sync_status',
      exercises: 'id, body_part_group_id, sync_status',
      workouts: 'id, gym_id, start_time, sync_status',
      workout_exercises: 'id, workout_id, exercise_id, sync_status',
      workout_sets: 'id, workout_exercise_id, performed_at, sync_status',
    })
  }

  rows<T extends DataTable>(name: T): Table<LocalRow<T>, string> {
    return this.table(name)
  }

  async snapshot(): Promise<LocalSnapshot> {
    return {
      settings: await this.rows('settings').toArray(),
      body_part_groups: await this.rows('body_part_groups').toArray(),
      gyms: await this.rows('gyms').toArray(),
      exercises: await this.rows('exercises').toArray(),
      workouts: await this.rows('workouts').toArray(),
      workout_exercises: await this.rows('workout_exercises').toArray(),
      workout_sets: await this.rows('workout_sets').toArray(),
    }
  }
}

let activeDatabase: LocalDatabase | undefined

export function activateLocalDatabase(userId: string | null): void {
  if (activeDatabase?.userId === userId) return
  activeDatabase?.close()
  activeDatabase = userId ? new LocalDatabase(userId) : undefined
}

export function getLocalDatabase(): LocalDatabase {
  if (!activeDatabase) throw new Error('Sign in before accessing local data.')
  return activeDatabase
}

export function nextUpdatedAt(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString()
}

export function validateSnapshot(snapshot: LocalSnapshot, userId: string): void {
  const parents = new Map<DataTable, Map<string, LocalRow<DataTable>>>()
  for (const name of dataTables) {
    const ids = new Set<string>()
    const rowsById = new Map<string, LocalRow<DataTable>>()
    for (const row of snapshot[name]) {
      if (row.user_id !== userId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id) || ids.has(row.id)) throw new Error(`Invalid ownership or duplicate ID in ${name}.`)
      ids.add(row.id)
      rowsById.set(row.id, row)
      if (!Number.isFinite(Date.parse(row.updated_at)) || !Number.isFinite(Date.parse(row.created_at))) {
        throw new Error(`Invalid timestamps in ${name}.`)
      }
      if (typeof row.is_deleted !== 'boolean') throw new Error(`Invalid deletion flag in ${name}.`)
      if (!['pending', 'synced'].includes(row.sync_status)) throw new Error(`Invalid sync status in ${name}.`)
    }
    parents.set(name, rowsById)
  }
  const active = <T extends DataTable>(name: T) => snapshot[name].filter((row) => !row.is_deleted)
  const unique = (keys: string[], label: string) => {
    if (new Set(keys).size !== keys.length) throw new Error(`${label} must be unique.`)
  }
  const requiredName = (value: string, label: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  }
  const parent = (name: DataTable, id: string) => {
    const row = parents.get(name)?.get(id)
    if (!row) throw new Error(`Missing ${name} record ${id}. Pull the related data first.`)
    return row
  }

  unique(active('settings').map((row) => row.user_id), 'Active settings')
  for (const row of snapshot.settings) {
    if (!Number.isInteger(row.gym_detection_radius) || row.gym_detection_radius <= 0 || row.theme !== 'dark') {
      throw new Error('Detection radius must be a positive whole number of metres.')
    }
  }
  for (const name of ['body_part_groups', 'gyms', 'exercises'] as const) {
    unique(active(name).map((row) => row.name.toLowerCase()), `${name} names`)
    snapshot[name].forEach((row) => requiredName(row.name, 'Name'))
  }
  unique(active('gyms').map((row) => row.abbreviation.toLowerCase()), 'Gym abbreviations')
  for (const row of snapshot.gyms) {
    requiredName(row.abbreviation, 'Abbreviation')
    if (!Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90
      || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180) throw new Error('Invalid gym coordinates.')
  }
  for (const row of snapshot.exercises) {
    if (typeof row.machine !== 'boolean') throw new Error('Invalid exercise machine flag.')
    const group = parent('body_part_groups', row.body_part_group_id)
    if (!row.is_deleted && group.is_deleted) throw new Error('Cannot use a deleted body-part group.')
  }
  for (const row of snapshot.workouts) {
    if (row.gym_id) parent('gyms', row.gym_id)
    if (!Number.isFinite(Date.parse(row.start_time))
      || (row.end_time !== null && (!Number.isFinite(Date.parse(row.end_time)) || Date.parse(row.end_time) < Date.parse(row.start_time)))) {
      throw new Error('Invalid workout start or end time.')
    }
  }
  unique(active('workout_exercises').map((row) => `${row.workout_id}:${row.exercise_id}`), 'Workout exercises')
  unique(active('workout_exercises').map((row) => `${row.workout_id}:${row.exercise_order}`), 'Workout exercise order')
  for (const row of snapshot.workout_exercises) {
    parent('exercises', row.exercise_id)
    const workout = parent('workouts', row.workout_id)
    if (!row.is_deleted && workout.is_deleted) throw new Error('An active exercise belongs to a deleted workout. Resolve the sync conflict first.')
    if (!Number.isInteger(row.exercise_order) || row.exercise_order < 0) throw new Error('Invalid workout exercise order.')
  }
  unique(active('workout_sets').map((row) => `${row.workout_exercise_id}:${row.set_number}`), 'Set numbers')
  for (const row of snapshot.workout_sets) {
    const exercise = parent('workout_exercises', row.workout_exercise_id)
    if (!row.is_deleted && exercise.is_deleted) throw new Error('An active set belongs to a deleted workout exercise. Resolve the sync conflict first.')
    if (!Number.isInteger(row.set_number) || row.set_number <= 0 || !Number.isInteger(row.reps) || row.reps <= 0
      || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 99999.999
      || !Number.isFinite(Date.parse(row.performed_at))) throw new Error('Invalid workout set.')
  }
}

export async function listLocalRows<T extends DataTable>(name: T, includeDeleted = false): Promise<LocalRow<T>[]> {
  const rows = await getLocalDatabase().rows(name).toArray()
  return includeDeleted ? rows : rows.filter((row) => !row.is_deleted)
}

export async function getLocalRow<T extends DataTable>(name: T, id: string, includeDeleted = false): Promise<LocalRow<T> | null> {
  const row = await getLocalDatabase().rows(name).get(id)
  return row && (includeDeleted || !row.is_deleted) ? row : null
}

export async function createLocalRow<T extends DataTable>(name: T, input: RowInput<T>): Promise<LocalRow<T>> {
  const db = getLocalDatabase()
  const timestamp = nextUpdatedAt()
  const row: LocalRow<T> = {
    ...input, id: crypto.randomUUID(), user_id: db.userId,
    created_at: timestamp, updated_at: timestamp, sync_status: 'pending',
  }
  await db.transaction('rw', db.tables, async () => {
    await db.rows(name).add(row)
    validateSnapshot(await db.snapshot(), db.userId)
  })
  return row
}

export async function updateLocalRow<T extends DataTable>(
  name: T, id: string, input: Partial<RowInput<T>>,
): Promise<LocalRow<T>> {
  const db = getLocalDatabase()
  return db.transaction('rw', db.tables, async () => {
    const current = await db.rows(name).get(id)
    if (!current) throw new Error(`${name} record was not found.`)
    const row: LocalRow<T> = {
      ...current, ...input, updated_at: nextUpdatedAt(current.updated_at), sync_status: 'pending',
    }
    await db.rows(name).put(row)
    validateSnapshot(await db.snapshot(), db.userId)
    return row
  })
}

export async function deleteLocalRow(name: DataTable, id: string): Promise<void> {
  const db = getLocalDatabase()
  await db.transaction('rw', db.tables, async () => {
    await markDeleted(db, name, id)
    validateSnapshot(await db.snapshot(), db.userId)
  })
}

async function markDeleted(db: LocalDatabase, name: DataTable, id: string): Promise<void> {
  const row = await db.rows(name).get(id)
  if (!row) throw new Error(`${name} record was not found.`)
  if (row.is_deleted) return
  const timestamp = nextUpdatedAt(row.updated_at)
  await db.rows(name).update(id, { is_deleted: true, updated_at: timestamp, sync_status: 'pending' })
  if (name === 'workouts') {
    const children = await db.rows('workout_exercises').where('workout_id').equals(id).toArray()
    for (const child of children) await markDeleted(db, 'workout_exercises', child.id)
  }
  if (name === 'workout_exercises') {
    await db.rows('workout_sets').where('workout_exercise_id').equals(id).filter((set) => !set.is_deleted)
      .modify((set) => {
        set.is_deleted = true
        set.updated_at = nextUpdatedAt(set.updated_at)
        set.sync_status = 'pending'
      })
  }
}

export async function resetLocalData(): Promise<void> {
  const db = getLocalDatabase()
  await db.transaction('rw', db.tables, async () => {
    for (const name of [...dataTables].reverse()) {
      for (const row of await db.rows(name).toArray()) {
        if (!row.is_deleted) await markDeleted(db, name, row.id)
      }
    }
    validateSnapshot(await db.snapshot(), db.userId)
  })
}
