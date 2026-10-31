import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateLocalDatabase, createLocalRow, deleteLocalRow, getLocalDatabase, listLocalRows,
  LocalDatabase, resetLocalData, updateLocalRow,
} from '../src/db/local'
import { emptyServerSnapshot, manualSync, pullIntoLocal, pushFromLocal } from '../src/db/sync'
import { exportAllDataToJson, importAllDataFromJson } from '../src/db/backup'
import { moveWorkoutSet, resequenceWorkoutSets } from '../src/data/workouts'
import { uploadWorkoutToStrava, downloadWorkoutStravaJson } from '../src/data/strava'
import { supabase } from '../src/lib/supabase'
import { automaticSync, syncData } from '../src/data/sync'
import { closePreviousDayWorkouts } from '../src/data/workouts'
import { getSettings, updateSettings } from '../src/data/settings'

vi.mock('../src/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn(), auth: { getSession: vi.fn() } },
}))

let db: LocalDatabase
beforeEach(() => {
  activateLocalDatabase(crypto.randomUUID())
  db = getLocalDatabase()
})
afterEach(async () => {
  activateLocalDatabase(null)
  await db.delete()
  vi.restoreAllMocks()
  vi.mocked(supabase.functions.invoke).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.auth.getSession).mockReset()
})

const groupInput = (name = 'Back') => ({ name, is_deleted: false })

async function lifecycle(now: Date) {
  await closePreviousDayWorkouts(now)
  await automaticSync(db)
}

async function workoutTree() {
  const group = await createLocalRow('body_part_groups', groupInput())
  const exercise = await createLocalRow('exercises', {
    name: 'Row', body_part_group_id: group.id, machine: false, notes: null, strava_exercise_type: 'ROW', is_deleted: false,
  })
  const workout = await createLocalRow('workouts', {
    start_time: '2026-10-01T09:00:00Z', end_time: null, gym_id: null, note: null, is_deleted: false,
  })
  const entry = await createLocalRow('workout_exercises', {
    workout_id: workout.id, exercise_id: exercise.id, exercise_order: 0, is_deleted: false,
  })
  const set = await createLocalRow('workout_sets', {
    workout_exercise_id: entry.id, set_number: 1, reps: 8, weight: 50, performed_at: '2026-10-01T09:10:00Z', is_deleted: false,
  })
  return { group, exercise, workout, entry, set }
}

describe('local primary storage', () => {
  it('starts empty, persists UUID/pending writes and never uses the network', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    expect(Object.values(await db.snapshot()).every((rows) => rows.length === 0)).toBe(true)
    const group = await createLocalRow('body_part_groups', groupInput())
    expect(group).toMatchObject({ sync_status: 'pending', user_id: db.userId })
    expect(group.id).toMatch(/^[0-9a-f-]{36}$/)
    const changed = await updateLocalRow('body_part_groups', group.id, { name: 'Upper back' })
    expect(Date.parse(changed.updated_at)).toBeGreaterThan(Date.parse(group.updated_at))
    const userId = db.userId
    activateLocalDatabase(null)
    expect(() => getLocalDatabase()).toThrow('Sign in')
    activateLocalDatabase(userId)
    db = getLocalDatabase()
    expect(await db.rows('body_part_groups').get(group.id)).toEqual(changed)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('isolates accounts', async () => {
    await createLocalRow('body_part_groups', groupInput())
    const other = new LocalDatabase(crypto.randomUUID())
    expect(await other.rows('body_part_groups').count()).toBe(0)
    await other.delete()
    expect(await db.rows('body_part_groups').count()).toBe(1)
  })

  it('rejects active duplicates atomically but permits name reuse after deletion', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    await expect(createLocalRow('body_part_groups', groupInput('BACK'))).rejects.toThrow('unique')
    expect(await db.rows('body_part_groups').count()).toBe(1)
    await deleteLocalRow('body_part_groups', group.id)
    await createLocalRow('body_part_groups', groupInput())
    expect(await listLocalRows('body_part_groups')).toHaveLength(1)
    expect(await db.rows('body_part_groups').count()).toBe(2)
  })

  it('cascades deletion across multiple children and resets without erasing IDs', async () => {
    const { workout, entry } = await workoutTree()
    await createLocalRow('workout_sets', {
      workout_exercise_id: entry.id, set_number: 2, weight: 50, reps: 8,
      performed_at: '2026-10-01T09:11:00Z', is_deleted: false,
    })
    await deleteLocalRow('workouts', workout.id)
    expect((await db.rows('workout_sets').toArray()).every((row) => row.is_deleted && row.sync_status === 'pending')).toBe(true)
    await resetLocalData()
    expect(Object.values(await db.snapshot()).flat().every((row) => row.is_deleted)).toBe(true)
    expect(await db.rows('workout_sets').count()).toBe(2)
  })

  it('moves a set into an occupied set number and resequences atomically', async () => {
    const { group, workout, entry, set } = await workoutTree()
    const exercise = await createLocalRow('exercises', {
      name: 'Pullup', body_part_group_id: group.id, machine: false, notes: null, strava_exercise_type: null, is_deleted: false,
    })
    const target = await createLocalRow('workout_exercises', {
      workout_id: workout.id, exercise_id: exercise.id, exercise_order: 1, is_deleted: false,
    })
    const other = await createLocalRow('workout_sets', {
      workout_exercise_id: target.id, set_number: 1, reps: 8, weight: 50,
      performed_at: '2026-10-01T09:11:00Z', is_deleted: false,
    })
    await moveWorkoutSet(set.id, target.id)
    expect(await db.rows('workout_exercises').get(entry.id)).toMatchObject({ is_deleted: true })
    expect(await db.rows('workout_sets').get(other.id)).toMatchObject({ set_number: 2 })
    await resequenceWorkoutSets([other.id, set.id])
    expect(await db.rows('workout_sets').get(set.id)).toMatchObject({ set_number: 2 })
  })

  it.each([1, 2, 3])('restores backup v%s locally and rolls invalid imports back', async (version) => {
    const old = await createLocalRow('body_part_groups', groupInput('Old'))
    const id = version === 1 ? 1 : crypto.randomUUID()
    const backup = {
      schemaVersion: version,
      data: { settings: [], bodyPartGroups: [{ id, name: 'Imported', isDeleted: false }],
        exercises: [], gyms: [], workouts: [], workoutExercises: [], workoutSets: [] },
    }
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    await db.syncMetadata().put({ key: 'pull_cursor', value: '4' })
    await importAllDataFromJson(new File([JSON.stringify(backup)], 'backup.json'))
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('4')
    expect(await db.rows('body_part_groups').get(old.id)).toMatchObject({ is_deleted: true, sync_status: 'pending' })
    const imported = (await listLocalRows('body_part_groups'))[0]
    expect(imported.name).toBe('Imported')
    if (version !== 1) expect(imported.id).toBe(id)
    const previous = await db.snapshot()
    backup.data.bodyPartGroups[0].name = ''
    await expect(importAllDataFromJson(new File([JSON.stringify(backup)], 'bad.json'))).rejects.toThrow('required')
    expect(await db.snapshot()).toEqual(previous)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exports local tombstones in backup v3 without sync metadata', async () => {
    const { workout } = await workoutTree()
    await deleteLocalRow('workouts', workout.id)
    await db.syncMetadata().put({ key: 'pull_cursor', value: '5' })
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob
      return 'blob:test'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.fn()
    vi.stubGlobal('document', { createElement: () => ({ click }) })
    try {
      await exportAllDataToJson()
      const text = await blob!.text()
      const payload = JSON.parse(text)
      expect(payload.schemaVersion).toBe(3)
      expect(payload.data.workouts[0]).toMatchObject({ id: workout.id, isDeleted: true })
      expect(payload.data.workoutSets[0].isDeleted).toBe(true)
      expect(text).not.toContain('sync_status')
      expect(text).not.toContain('pull_cursor')
      expect(click).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('blocks explicit Strava actions before Push without contacting remote functions', async () => {
    const { workout } = await workoutTree()
    await expect(uploadWorkoutToStrava(workout.id)).rejects.toThrow('Press Sync')
    await expect(downloadWorkoutStravaJson(workout.id)).rejects.toThrow('Press Sync')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('permits explicit Strava upload after sync but blocks newly edited data', async () => {
    const { workout, set } = await workoutTree()
    await pushFromLocal(db, { push: async (rows) => rows, pull: vi.fn() })
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { connected: true, connection: { scope: 'activity:write' } }, error: null })
      .mockResolvedValueOnce({ data: { uploaded: true }, error: null })
    expect(await uploadWorkoutToStrava(workout.id)).toEqual({ uploaded: true })
    expect(supabase.functions.invoke).toHaveBeenLastCalledWith('strava-upload-workout', { body: { workoutId: workout.id } })
    await updateLocalRow('workout_sets', set.id, { reps: 10 })
    await expect(uploadWorkoutToStrava(workout.id)).rejects.toThrow('Press Sync')
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
  })
})

describe('manual synchronization', () => {
  it('shares the default 3600-second cooldown across starts/resumes after OK or BAD', async () => {
    const completed = new Date('2026-10-31T12:00:00Z')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { cursor: '0', data: emptyServerSnapshot() }, error: null,
    })
    for (const status of ['OK', 'BAD'] as const) {
      await db.lastSyncMetadata().put({ key: 'last_sync', timestamp: completed.toISOString(), status })
      await automaticSync(db, new Date(completed.getTime() + 3599999))
      expect(supabase.rpc).not.toHaveBeenCalled()
    }
    await automaticSync(db, new Date(completed.getTime() + 3600000))
    expect(supabase.rpc).toHaveBeenCalledOnce()
  })

  it('closes older workouts during cooldown without network requests', async () => {
    const { workout } = await workoutTree()
    await db.lastSyncMetadata().put({ key: 'last_sync', timestamp: new Date().toISOString(), status: 'BAD' })
    await lifecycle(new Date('2026-10-02T12:00:00Z'))
    expect((await db.rows('workouts').get(workout.id))?.end_time).not.toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('persists configurable cooldown and validates negative/fractional values', async () => {
    expect(await getSettings()).toBeNull()
    const initial = await updateSettings({ gymDetectionRadius: 200, theme: 'dark' })
    expect(initial.syncCooldownSeconds).toBe(3600)
    await updateSettings({ gymDetectionRadius: 200, theme: 'dark', syncCooldownSeconds: 5 })
    const userId = db.userId
    activateLocalDatabase(null)
    activateLocalDatabase(userId)
    db = getLocalDatabase()
    expect((await getSettings())?.syncCooldownSeconds).toBe(5)
    for (const value of [-1, 0.5, 2147483648]) {
      await expect(updateSettings({ gymDetectionRadius: 200, theme: 'dark', syncCooldownSeconds: value })).rejects.toThrow('Sync cooldown')
    }
    expect((await getSettings())?.syncCooldownSeconds).toBe(5)
  })

  it('restores older backups with default cooldown and preserves configured values', async () => {
    const setting = { id: crypto.randomUUID(), isDeleted: false, gymDetectionRadius: 200, theme: 'dark' }
    const backup = { schemaVersion: 3, data: { settings: [setting], bodyPartGroups: [], exercises: [],
      gyms: [], workouts: [], workoutExercises: [], workoutSets: [] } }
    await importAllDataFromJson(new File([JSON.stringify(backup)], 'old.json'))
    expect((await getSettings())?.syncCooldownSeconds).toBe(3600)
    const configured = { ...backup, data: { ...backup.data, settings: [{ ...setting, syncCooldownSeconds: 30 }] } }
    await importAllDataFromJson(new File([JSON.stringify(configured)], 'new.json'))
    expect((await getSettings())?.syncCooldownSeconds).toBe(30)
  })

  it('manual Sync bypasses cooldown, zero allows each start, and busy skips automatic Sync', async () => {
    await updateSettings({ gymDetectionRadius: 200, theme: 'dark', syncCooldownSeconds: 0 })
    await db.lastSyncMetadata().put({ key: 'last_sync', timestamp: new Date().toISOString(), status: 'OK' })
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc).mockImplementation(async (name, args) => ({
      data: name === 'pull_local_changes' ? { cursor: '0', data: emptyServerSnapshot() } : args!.changes,
      error: null,
    }))
    await automaticSync(db)
    await automaticSync(db)
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
    await updateSettings({ gymDetectionRadius: 200, theme: 'dark', syncCooldownSeconds: 3600 })
    await syncData()
    expect(supabase.rpc).toHaveBeenCalledTimes(5)
    let release!: () => void
    let started!: () => void
    const start = new Promise<void>((resolve) => { started = resolve })
    vi.mocked(supabase.rpc).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; started() })
      return { data: { cursor: '0', data: emptyServerSnapshot() }, error: null }
    })
    const manual = syncData()
    await start
    const before = vi.mocked(supabase.rpc).mock.calls.length
    await automaticSync(db, new Date(Date.now() + 7200000))
    await expect(syncData()).rejects.toThrow('already running')
    expect(supabase.rpc).toHaveBeenCalledTimes(before)
    release()
    await manual
  })

  it('closes previous-day workouts before one automatic Pull-Push and records OK', async () => {
    const { workout, set } = await workoutTree()
    const empty = await createLocalRow('workouts', {
      start_time: '2026-10-01T08:00:00Z', end_time: null, gym_id: null, note: null, is_deleted: false,
    })
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc)
      .mockImplementationOnce(async () => {
        expect((await db.rows('workouts').get(workout.id))?.end_time).toBe(new Date(set.performed_at).toISOString())
        expect((await db.rows('workouts').get(empty.id))?.end_time).toBe(new Date(empty.start_time).toISOString())
        return { data: { cursor: '1', data: emptyServerSnapshot() }, error: null }
      })
      .mockImplementationOnce(async (_name, args) => ({ data: args!.changes, error: null }))
    await lifecycle(new Date('2026-10-02T12:00:00Z'))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect((await db.lastSyncMetadata().get('last_sync'))?.status).toBe('OK')
    await lifecycle(new Date('2026-10-02T12:00:00Z'))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('does not auto-close current-day/future workouts or sync when no closure occurs', async () => {
    const now = new Date()
    for (const start of [now, new Date(now.getTime() + 86400000)]) {
      await createLocalRow('workouts', {
        start_time: start.toISOString(), end_time: null, gym_id: null, note: null, is_deleted: false,
      })
    }
    await closePreviousDayWorkouts(now)
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect((await db.rows('workouts').toArray()).every((row) => row.end_time === null)).toBe(true)
  })

  it('triggers only one auto-sync when closure is invoked concurrently', async () => {
    await workoutTree()
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: { cursor: '1', data: emptyServerSnapshot() }, error: null })
      .mockImplementationOnce(async (_name, args) => ({ data: args!.changes, error: null }))
    const now = new Date('2026-10-02T12:00:00Z')
    await Promise.all([lifecycle(now), lifecycle(now)])
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('keeps closure pending and records BAD when automatic sync fails', async () => {
    const { workout, set } = await workoutTree()
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('Offline'))
    const now = new Date('2026-10-02T12:00:00Z')
    await expect(lifecycle(now)).rejects.toThrow('Offline')
    expect(await db.rows('workouts').get(workout.id)).toMatchObject({ end_time: new Date(set.performed_at).toISOString(), sync_status: 'pending' })
    expect((await db.lastSyncMetadata().get('last_sync'))?.status).toBe('BAD')
    await lifecycle(now)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('runs Pull then Push, uploading only pending rows after merging', async () => {
    const local = await createLocalRow('body_part_groups', groupInput('Local edit'))
    const server = { ...local, id: crypto.randomUUID(), name: 'Server row' }
    const events: string[] = []
    const result = await manualSync('sync', {
      pull: async (cursor) => {
        events.push('pull')
        expect(cursor).toBeNull()
        return { cursor: '20', data: { ...emptyServerSnapshot(), body_part_groups: [server] } }
      },
      push: async (rows) => {
        events.push('push')
        expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('20')
        expect(rows.body_part_groups.map((row) => row.id)).toEqual([local.id])
        return rows
      },
    })
    expect(events).toEqual(['pull', 'push'])
    expect(result).toEqual({ records: 2, keptLocal: 0 })
    expect((await db.rows('body_part_groups').toArray()).every((row) => row.sync_status === 'synced')).toBe(true)
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('20')
  })

  it('does not Push when Pull fails and allows retry after the failure', async () => {
    await createLocalRow('body_part_groups', groupInput())
    const push = vi.fn(async (rows) => rows)
    await expect(manualSync('sync', {
      push, pull: async () => { throw new Error('Download failed') },
    })).rejects.toThrow('Download failed')
    expect(push).not.toHaveBeenCalled()
    const failedMerge = await db.snapshot()
    await expect(manualSync('sync', {
      push, pull: async () => ({ cursor: '1', data: {
        ...emptyServerSnapshot(), body_part_groups: [{ ...failedMerge.body_part_groups[0], id: crypto.randomUUID() }],
      } }),
    })).rejects.toThrow('unique')
    expect(push).not.toHaveBeenCalled()
    await manualSync('sync', { push, pull: async () => ({ cursor: '1', data: emptyServerSnapshot() }) })
    expect(push).toHaveBeenCalledOnce()
  })

  it('reports Push failure while preserving the completed Pull and pending edits', async () => {
    const local = await createLocalRow('body_part_groups', groupInput())
    await expect(manualSync('sync', {
      pull: async () => ({ cursor: '12', data: emptyServerSnapshot() }),
      push: async () => { throw new Error('Upload failed') },
    })).rejects.toThrow('Pull completed, but Push failed')
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('12')
    expect(await db.rows('body_part_groups').get(local.id)).toMatchObject({ sync_status: 'pending' })
  })

  it('keeps the busy lock through Push and preserves edits made in flight', async () => {
    const local = await createLocalRow('body_part_groups', groupInput())
    let release!: () => void
    let started!: () => void
    const start = new Promise<void>((resolve) => { started = resolve })
    const running = manualSync('sync', {
      pull: async () => ({ cursor: '10', data: emptyServerSnapshot() }),
      push: async (rows) => {
        await new Promise<void>((resolve) => { release = resolve; started() })
        return rows
      },
    })
    await start
    await expect(manualSync('sync', { pull: vi.fn(), push: vi.fn() })).rejects.toThrow('already running')
    await updateLocalRow('body_part_groups', local.id, { name: 'During upload' })
    release()
    expect((await running).keptLocal).toBe(1)
    expect(await db.rows('body_part_groups').get(local.id)).toMatchObject({ name: 'During upload', sync_status: 'pending' })
  })

  it('calls only the incremental RPC with the saved cursor and validates its response', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { cursor: '7', data: emptyServerSnapshot() }, error: null,
    })
    await syncData()
    expect(supabase.rpc).toHaveBeenLastCalledWith('pull_local_changes', { since_revision: null })
    const successful = await db.lastSyncMetadata().get('last_sync')
    expect(successful?.status).toBe('OK')
    expect(Number.isFinite(Date.parse(successful!.timestamp))).toBe(true)
    const userId = db.userId
    activateLocalDatabase(null)
    activateLocalDatabase(userId)
    db = getLocalDatabase()
    expect(await db.lastSyncMetadata().get('last_sync')).toEqual(successful)
    await syncData()
    expect(supabase.rpc).toHaveBeenLastCalledWith('pull_local_changes', { since_revision: '7' })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { cursor: '8', data: {} }, error: null })
    await expect(syncData()).rejects.toThrow('Invalid sync response')
    expect((await db.lastSyncMetadata().get('last_sync'))?.status).toBe('BAD')
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { cursor: null, data: emptyServerSnapshot() }, error: null })
    await expect(syncData()).rejects.toThrow('Invalid incremental Pull response')
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('7')
  })

  it('records BAD when Push fails after a successful Pull', async () => {
    await createLocalRow('body_part_groups', groupInput())
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: { cursor: '9', data: emptyServerSnapshot() }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Upload unavailable' } })
    await expect(syncData()).rejects.toThrow('Pull completed, but Push failed')
    expect((await db.lastSyncMetadata().get('last_sync'))?.status).toBe('BAD')
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('9')
  })

  it('reports failures to persist last sync instead of claiming success', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: db.userId } } }, error: null,
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { cursor: '1', data: emptyServerSnapshot() }, error: null,
    })
    const table = db.lastSyncMetadata()
    const put = table.put.bind(table)
    vi.spyOn(table, 'put').mockImplementation((row) => {
      if (row.key === 'last_sync') return Promise.reject(new Error('Storage full'))
      return put(row)
    })
    await expect(syncData()).rejects.toThrow('Sync completed, but its status could not be saved')
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('Offline'))
    await expect(syncData()).rejects.toThrow('Sync failed and its status could not be saved')
  })

  it('strips sync_status, sends only pending rows, acknowledges success', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const push = vi.fn(async (snapshot) => {
      expect(snapshot.body_part_groups[0]).not.toHaveProperty('sync_status')
      return snapshot
    })
    expect(await pushFromLocal(db, { push, pull: vi.fn() })).toEqual({ records: 1, keptLocal: 0 })
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ sync_status: 'synced' })
    await pushFromLocal(db, { push, pull: vi.fn() })
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('retains pending rows on failures or incomplete acknowledgements', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    await expect(pushFromLocal(db, { push: async () => { throw new Error('Offline') }, pull: vi.fn() })).rejects.toThrow('Offline')
    await expect(pushFromLocal(db, { push: async () => emptyServerSnapshot(), pull: vi.fn() })).rejects.toThrow('acknowledge')
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ sync_status: 'pending' })
  })

  it('preserves an edit made while Push is in flight', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const result = await pushFromLocal(db, {
      pull: vi.fn(),
      push: async (snapshot) => {
        await updateLocalRow('body_part_groups', group.id, { name: 'New edit' })
        return snapshot
      },
    })
    expect(result.keptLocal).toBe(1)
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ name: 'New edit', sync_status: 'pending' })
  })

  it('applies a newer server winner returned by Push', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    await pushFromLocal(db, { pull: vi.fn(), push: async (snapshot) => ({
      ...snapshot, body_part_groups: [{ ...snapshot.body_part_groups[0], name: 'Remote winner', updated_at: '2090-01-01T00:00:00Z' }],
    }) })
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ name: 'Remote winner', sync_status: 'synced' })
  })

  it('preserves an edit made while Pull is in flight', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    await manualSync('pull', {
      push: vi.fn(),
      pull: async () => {
        await updateLocalRow('body_part_groups', group.id, { name: 'During pull' })
        return { cursor: '1', data: { ...emptyServerSnapshot(), body_part_groups: [group] } }
      },
    })
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ name: 'During pull', sync_status: 'pending' })
  })

  it('does not partially apply a parent deletion that conflicts with newer active children', async () => {
    const { workout } = await workoutTree()
    const before = await db.snapshot()
    const incoming = { ...emptyServerSnapshot(), workouts: [{ ...workout, is_deleted: true, updated_at: '2090-01-01T00:00:00Z' }] }
    await expect(pullIntoLocal(db, incoming)).rejects.toThrow('deleted workout')
    expect(await db.snapshot()).toEqual(before)
  })

  it('uses LWW for Pull, server wins ties, and missing rows stay local', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const extra = await createLocalRow('body_part_groups', groupInput('Local only'))
    const snapshot = emptyServerSnapshot()
    snapshot.body_part_groups = [{ ...group, name: 'Older', updated_at: '2020-01-01T00:00:00Z' }]
    expect((await pullIntoLocal(db, snapshot)).keptLocal).toBe(1)
    snapshot.body_part_groups = [{ ...group, name: 'Server tie' }]
    await pullIntoLocal(db, snapshot)
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ name: 'Server tie', sync_status: 'synced' })
    expect(await db.rows('body_part_groups').get(extra.id)).toMatchObject({ sync_status: 'pending' })
    snapshot.body_part_groups = [{ ...group, is_deleted: true, updated_at: '2090-01-01T00:00:00Z' }]
    await pullIntoLocal(db, snapshot)
    expect(await listLocalRows('body_part_groups')).toHaveLength(1)
  })

  it('preserves server timestamp microseconds and rejects older submillisecond revisions', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const snapshot = emptyServerSnapshot()
    snapshot.body_part_groups = [{ ...group, updated_at: '2090-01-01T00:00:00.123456+00:00' }]
    await pullIntoLocal(db, snapshot)
    snapshot.body_part_groups[0] = { ...snapshot.body_part_groups[0], name: 'Older', updated_at: '2090-01-01T00:00:00.123123Z' }
    expect((await pullIntoLocal(db, snapshot)).keptLocal).toBe(1)
    expect(await db.rows('body_part_groups').get(group.id)).toMatchObject({ updated_at: '2090-01-01T00:00:00.123456+00:00', name: 'Back' })
  })

  it('rolls a conflicting Pull back without losing local pending rows', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const snapshot = emptyServerSnapshot()
    snapshot.body_part_groups = [{ ...group, id: crypto.randomUUID() }]
    await expect(pullIntoLocal(db, snapshot)).rejects.toThrow('unique')
    expect(await db.rows('body_part_groups').toArray()).toEqual([group])
  })

  it('rejects wrong-owner Pull and concurrent manual operations', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const snapshot = emptyServerSnapshot()
    snapshot.body_part_groups = [{ ...group, user_id: crypto.randomUUID() }]
    await expect(pullIntoLocal(db, snapshot)).rejects.toThrow('ownership')
    let finish!: () => void
    let started!: () => void
    const start = new Promise<void>((resolve) => { started = resolve })
    const running = manualSync('pull', { push: vi.fn(), pull: async () => {
      await new Promise<void>((resolve) => { finish = resolve; started() })
      return { cursor: '0', data: emptyServerSnapshot() }
    } })
    await start
    await expect(manualSync('pull', { push: vi.fn(), pull: vi.fn() })).rejects.toThrow('already running')
    finish()
    await running
  })

  it('persists the Pull cursor across reopening and sends it only on subsequent Pulls', async () => {
    const pull = vi.fn(async () => ({ cursor: '9007199254740993', data: emptyServerSnapshot() }))
    await manualSync('pull', { push: vi.fn(), pull })
    expect(pull).toHaveBeenLastCalledWith(null)
    const userId = db.userId
    activateLocalDatabase(null)
    activateLocalDatabase(userId)
    db = getLocalDatabase()
    await manualSync('pull', { push: vi.fn(), pull })
    expect(pull).toHaveBeenLastCalledWith('9007199254740993')
    const group = await createLocalRow('body_part_groups', groupInput())
    await pushFromLocal(db, { pull, push: async (data) => data })
    await updateLocalRow('body_part_groups', group.id, { name: 'Edited' })
    await resetLocalData()
    expect(await db.syncMetadata().get('pull_cursor')).toEqual({ key: 'pull_cursor', value: '9007199254740993' })
  })

  it('updates data and cursor atomically and retains both on failed Pull', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    await pullIntoLocal(db, emptyServerSnapshot(), '10')
    const before = await db.snapshot()
    const conflict = { ...emptyServerSnapshot(), body_part_groups: [{ ...group, id: crypto.randomUUID() }] }
    await expect(pullIntoLocal(db, conflict, '11')).rejects.toThrow('unique')
    expect(await db.snapshot()).toEqual(before)
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('10')
    await expect(manualSync('pull', { push: vi.fn(), pull: async () => { throw new Error('Offline') } })).rejects.toThrow('Offline')
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('10')
    await expect(pullIntoLocal(db, emptyServerSnapshot(), '9')).rejects.toThrow('backwards')
    await expect(pullIntoLocal(db, emptyServerSnapshot(), 'invalid')).rejects.toThrow('Invalid Pull cursor')
    await pullIntoLocal(db, emptyServerSnapshot(), '11')
    expect((await db.syncMetadata().get('pull_cursor'))?.value).toBe('11')
  })

  it('rolls back merged rows if saving the Pull cursor fails', async () => {
    const group = await createLocalRow('body_part_groups', groupInput())
    const save = vi.spyOn(db.syncMetadata(), 'put').mockRejectedValueOnce(new Error('Storage failure'))
    const incoming = { ...emptyServerSnapshot(), body_part_groups: [{ ...group, name: 'Server rename' }] }
    await expect(pullIntoLocal(db, incoming, '1')).rejects.toThrow('Storage failure')
    save.mockRestore()
    expect(await db.rows('body_part_groups').get(group.id)).toEqual(group)
    expect(await db.syncMetadata().get('pull_cursor')).toBeUndefined()
  })

  it('upgrades existing Dexie v1 data without setting a Pull cursor', async () => {
    const userId = crypto.randomUUID()
    const legacy = new LocalDatabase(userId)
    await legacy.delete()
    const { default: Dexie } = await import('dexie')
    const v1 = new Dexie(`gymlog-${userId}`)
    v1.version(1).stores({
      settings: 'id, sync_status', body_part_groups: 'id, sync_status', gyms: 'id, sync_status',
      exercises: 'id, body_part_group_id, sync_status', workouts: 'id, gym_id, start_time, sync_status',
      workout_exercises: 'id, workout_id, exercise_id, sync_status',
      workout_sets: 'id, workout_exercise_id, performed_at, sync_status',
    })
    const group = { ...groupInput(), id: crypto.randomUUID(), user_id: userId, sync_status: 'pending',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    await v1.table('body_part_groups').add(group)
    const setting = { id: crypto.randomUUID(), user_id: userId, sync_status: 'synced',
      created_at: group.created_at, updated_at: group.updated_at,
      gym_detection_radius: 200, theme: 'dark', is_deleted: false }
    await v1.table('settings').add(setting)
    v1.close()
    const upgraded = new LocalDatabase(userId)
    try {
      expect(await upgraded.rows('body_part_groups').get(group.id)).toEqual(group)
      expect(await upgraded.rows('settings').get(setting.id)).toEqual({ ...setting, sync_cooldown_seconds: 3600 })
      expect(await upgraded.syncMetadata().get('pull_cursor')).toBeUndefined()
    } finally {
      await upgraded.delete()
    }
  })
})
