import type { BodyPartGroup, Exercise, Gym, Settings, Workout, WorkoutExercise, WorkoutSet } from './types'
import { getLocalDatabase, nextUpdatedAt, resetLocalData, validateSnapshot } from './local'
import { mapBodyPartGroup, mapExercise, mapGym, mapSettings, mapWorkout, mapWorkoutExercise, mapWorkoutSet } from '../data/mappers'

interface BackupData {
  settings: Settings[]
  bodyPartGroups: BodyPartGroup[]
  exercises: Exercise[]
  gyms: Gym[]
  workouts: Array<Omit<Workout, 'startTime' | 'endTime'> & { startTime: string; endTime?: string }>
  workoutExercises: WorkoutExercise[]
  workoutSets: Array<Omit<WorkoutSet, 'timestamp'> & { timestamp: string }>
}

function ensureArray<T>(value: unknown, fieldName: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid backup: ${fieldName} must be an array`)
  return value as T[]
}

export async function exportAllDataToJson(): Promise<void> {
  const db = getLocalDatabase()
  const snapshot = await db.transaction('r', db.tables, () => db.snapshot())
  const payload = {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    data: {
      settings: snapshot.settings.map(mapSettings),
      bodyPartGroups: snapshot.body_part_groups.map(mapBodyPartGroup),
      exercises: snapshot.exercises.map(mapExercise),
      gyms: snapshot.gyms.map(mapGym),
      workouts: snapshot.workouts.map(mapWorkout).map((workout) => ({
        ...workout, startTime: workout.startTime.toISOString(), endTime: workout.endTime?.toISOString(),
      })),
      workoutExercises: snapshot.workout_exercises.map(mapWorkoutExercise),
      workoutSets: snapshot.workout_sets.map(mapWorkoutSet).map((set) => ({ ...set, timestamp: set.timestamp.toISOString() })),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `gymlog-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function resetAllLocalData(): Promise<void> {
  await resetLocalData()
}

export async function importAllDataFromJson(file: File): Promise<{ records: number }> {
  const parsed = JSON.parse(await file.text()) as { schemaVersion?: number; data?: unknown }
  if (![1, 2, 3].includes(parsed.schemaVersion ?? 0) || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid backup: unsupported file format')
  }
  const data = parsed.data as BackupData
  const settings = ensureArray<Settings>(data.settings, 'settings')
  const groups = ensureArray<BodyPartGroup>(data.bodyPartGroups, 'bodyPartGroups')
  const exercises = ensureArray<Exercise>(data.exercises, 'exercises')
  const gyms = ensureArray<Gym>(data.gyms, 'gyms')
  const workouts = ensureArray<BackupData['workouts'][number]>(data.workouts, 'workouts')
  const entries = ensureArray<WorkoutExercise>(data.workoutExercises, 'workoutExercises')
  const sets = ensureArray<BackupData['workoutSets'][number]>(data.workoutSets, 'workoutSets')
  const makeIds = (rows: Array<{ id: string }>) => {
    const ids = new Map<string, string>()
    for (const row of rows) {
      const key = String(row.id)
      if (!row.id || ids.has(key)) throw new Error('Invalid backup: missing or duplicate record ID.')
      ids.set(key, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key) ? key : crypto.randomUUID())
    }
    return ids
  }
  const groupIds = makeIds(groups)
  const gymIds = makeIds(gyms)
  const exerciseIds = makeIds(exercises)
  const workoutIds = makeIds(workouts)
  const entryIds = makeIds(entries)
  const setIds = makeIds(sets)
  const settingIds = makeIds(settings)
  const requireId = (ids: Map<string, string>, id: string): string => {
    const mapped = ids.get(String(id))
    if (!mapped) throw new Error(`Invalid backup: missing related record ${id}.`)
    return mapped
  }
  const db = getLocalDatabase()
  await db.transaction('rw', db.tables, async () => {
    const previous = await db.snapshot()
    const latest = Object.values(previous).flat().reduce((value, row) => Math.max(value, Date.parse(row.updated_at)), 0)
    const timestamp = nextUpdatedAt(new Date(latest).toISOString())
    const metadata = (id: string, isDeleted = false) => ({
      id, user_id: db.userId, is_deleted: isDeleted,
      created_at: timestamp, updated_at: timestamp, sync_status: 'pending' as const,
    })
    await resetLocalData()
    await db.rows('settings').bulkPut(settings.map((row) => ({
      ...metadata(requireId(settingIds, row.id), row.isDeleted),
      gym_detection_radius: row.gymDetectionRadius, theme: row.theme,
    })))
    await db.rows('body_part_groups').bulkPut(groups.map((row) => ({
      ...metadata(requireId(groupIds, row.id), row.isDeleted), name: row.name,
    })))
    await db.rows('gyms').bulkPut(gyms.map((row) => ({
      ...metadata(requireId(gymIds, row.id), row.isDeleted), name: row.name, abbreviation: row.abbreviation,
      latitude: row.latitude, longitude: row.longitude,
    })))
    await db.rows('exercises').bulkPut(exercises.map((row) => ({
      ...metadata(requireId(exerciseIds, row.id), row.isDeleted),
      name: row.name, body_part_group_id: requireId(groupIds, row.bodyPartGroupId),
      machine: row.machine ?? false, notes: row.notes ?? null, strava_exercise_type: row.stravaExerciseType ?? null,
    })))
    await db.rows('workouts').bulkPut(workouts.map((row) => ({
      ...metadata(requireId(workoutIds, row.id), row.isDeleted),
      gym_id: row.gymId ? requireId(gymIds, row.gymId) : null, note: row.note?.trim() || null,
      start_time: new Date(row.startTime).toISOString(), end_time: row.endTime ? new Date(row.endTime).toISOString() : null,
    })))
    await db.rows('workout_exercises').bulkPut(entries.map((row) => ({
      ...metadata(requireId(entryIds, row.id), row.isDeleted),
      workout_id: requireId(workoutIds, row.workoutId), exercise_id: requireId(exerciseIds, row.exerciseId),
      exercise_order: row.order,
    })))
    await db.rows('workout_sets').bulkPut(sets.map((row) => ({
      ...metadata(requireId(setIds, row.id), row.isDeleted),
      workout_exercise_id: requireId(entryIds, row.workoutExerciseId), set_number: row.setNumber,
      weight: row.weight, reps: row.reps, performed_at: new Date(row.timestamp).toISOString(),
    })))
    validateSnapshot(await db.snapshot(), db.userId)
  })
  return { records: settings.length + groups.length + gyms.length + exercises.length + workouts.length + entries.length + sets.length }
}
