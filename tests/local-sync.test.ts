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

vi.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

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
})

const groupInput = (name = 'Back') => ({ name, is_deleted: false })

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
    await importAllDataFromJson(new File([JSON.stringify(backup)], 'backup.json'))
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
      expect(click).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('blocks explicit Strava actions before Push without contacting remote functions', async () => {
    const { workout } = await workoutTree()
    await expect(uploadWorkoutToStrava(workout.id)).rejects.toThrow('Press Push')
    await expect(downloadWorkoutStravaJson(workout.id)).rejects.toThrow('Press Push')
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
    await expect(uploadWorkoutToStrava(workout.id)).rejects.toThrow('Press Push')
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
  })
})

describe('manual synchronization', () => {
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
        return { ...emptyServerSnapshot(), body_part_groups: [group] }
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
    const running = manualSync('pull', { push: vi.fn(), pull: async () => {
      await new Promise<void>((resolve) => { finish = resolve })
      return emptyServerSnapshot()
    } })
    await expect(manualSync('pull', { push: vi.fn(), pull: vi.fn() })).rejects.toThrow('already running')
    finish()
    await running
  })
})
