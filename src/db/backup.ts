import { db } from './db'
import type {
  BodyPartGroup,
  Exercise,
  Gym,
  Settings,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types'

interface SerializedWorkout extends Omit<Workout, 'startTime' | 'endTime'> {
  startTime: string
  endTime?: string
}

interface SerializedWorkoutSet extends Omit<WorkoutSet, 'timestamp'> {
  timestamp: string
}

interface BackupData {
  settings: Settings[]
  bodyPartGroups: BodyPartGroup[]
  exercises: Exercise[]
  gyms: Gym[]
  workouts: SerializedWorkout[]
  workoutExercises: WorkoutExercise[]
  workoutSets: SerializedWorkoutSet[]
}

interface BackupPayload {
  schemaVersion: 1
  exportedAt: string
  data: BackupData
}

function formatBackupDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function ensureArray<T>(value: unknown, fieldName: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid backup: ${fieldName} must be an array`)
  }
  return value as T[]
}

function toWorkout(input: SerializedWorkout): Workout {
  return {
    ...input,
    startTime: new Date(input.startTime),
    endTime: input.endTime ? new Date(input.endTime) : undefined,
  }
}

function toWorkoutSet(input: SerializedWorkoutSet): WorkoutSet {
  return {
    ...input,
    timestamp: new Date(input.timestamp),
  }
}

function toGym(input: Gym): Gym {
  return {
    ...input,
    abbreviation: input.abbreviation?.trim() || input.name.slice(0, 3).toUpperCase(),
  }
}

export async function exportAllDataToJson(): Promise<void> {
  const [
    settings,
    bodyPartGroups,
    exercises,
    gyms,
    workouts,
    workoutExercises,
    workoutSets,
  ] = await Promise.all([
    db.settings.toArray(),
    db.bodyPartGroups.toArray(),
    db.exercises.toArray(),
    db.gyms.toArray(),
    db.workouts.toArray(),
    db.workoutExercises.toArray(),
    db.workoutSets.toArray(),
  ])

  const payload: BackupPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      bodyPartGroups,
      exercises,
      gyms,
      workouts: workouts.map((w) => ({
        ...w,
        startTime: w.startTime.toISOString(),
        endTime: w.endTime ? w.endTime.toISOString() : undefined,
      })),
      workoutExercises,
      workoutSets: workoutSets.map((s) => ({
        ...s,
        timestamp: s.timestamp.toISOString(),
      })),
    },
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gymlog-backup-${formatBackupDate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importAllDataFromJson(file: File): Promise<{ records: number }> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Partial<BackupPayload>

  if (parsed.schemaVersion !== 1 || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid backup: unsupported file format')
  }

  const data = parsed.data as BackupData
  const settings = ensureArray<Settings>(data.settings, 'settings')
  const bodyPartGroups = ensureArray<BodyPartGroup>(data.bodyPartGroups, 'bodyPartGroups')
  const exercises = ensureArray<Exercise>(data.exercises, 'exercises')
  const gyms = ensureArray<Gym>(data.gyms, 'gyms').map(toGym)
  const workoutsRaw = ensureArray<SerializedWorkout>(data.workouts, 'workouts')
  const workoutExercises = ensureArray<WorkoutExercise>(data.workoutExercises, 'workoutExercises')
  const workoutSetsRaw = ensureArray<SerializedWorkoutSet>(data.workoutSets, 'workoutSets')

  const workouts = workoutsRaw.map(toWorkout)
  const workoutSets = workoutSetsRaw.map(toWorkoutSet)

  await db.transaction(
    'rw',
    [
      db.settings,
      db.bodyPartGroups,
      db.exercises,
      db.gyms,
      db.workouts,
      db.workoutExercises,
      db.workoutSets,
    ],
    async () => {
      await db.workoutSets.clear()
      await db.workoutExercises.clear()
      await db.workouts.clear()
      await db.exercises.clear()
      await db.bodyPartGroups.clear()
      await db.gyms.clear()
      await db.settings.clear()

      if (settings.length > 0) await db.settings.bulkPut(settings)
      if (bodyPartGroups.length > 0) await db.bodyPartGroups.bulkPut(bodyPartGroups)
      if (exercises.length > 0) await db.exercises.bulkPut(exercises)
      if (gyms.length > 0) await db.gyms.bulkPut(gyms)
      if (workouts.length > 0) await db.workouts.bulkPut(workouts)
      if (workoutExercises.length > 0) await db.workoutExercises.bulkPut(workoutExercises)
      if (workoutSets.length > 0) await db.workoutSets.bulkPut(workoutSets)
    },
  )

  return {
    records:
      settings.length +
      bodyPartGroups.length +
      exercises.length +
      gyms.length +
      workouts.length +
      workoutExercises.length +
      workoutSets.length,
  }
}
