import { supabase } from '../lib/supabase'
import type { BodyPartGroup, Exercise, Gym, Settings, Workout, WorkoutExercise, WorkoutSet } from './types'
import { listBodyPartGroups } from '../data/bodyPartGroups'
import { listExercises } from '../data/exercises'
import { listGyms } from '../data/gyms'
import { listSettings } from '../data/settings'
import { listWorkoutExercises, listWorkoutSets, listWorkouts } from '../data/workouts'

interface BackupData {
  settings: Settings[]
  bodyPartGroups: BodyPartGroup[]
  exercises: Exercise[]
  gyms: Gym[]
  workouts: Array<Omit<Workout, 'startTime' | 'endTime'> & { startTime: string; endTime?: string }>
  workoutExercises: WorkoutExercise[]
  workoutSets: Array<Omit<WorkoutSet, 'timestamp'> & { timestamp: string }>
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
  if (!Array.isArray(value)) throw new Error(`Invalid backup: ${fieldName} must be an array`)
  return value as T[]
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in to manage backups.')
  return data.user.id
}

async function insertRows<T extends keyof import('../lib/database.types').Database['public']['Tables']>(
  table: T,
  rows: Array<import('../lib/database.types').Database['public']['Tables'][T]['Insert']>,
): Promise<number[]> {
  if (rows.length === 0) return []
  const { data, error } = await supabase
    .from(table as never)
    .insert(rows as never)
    .select('id')
  if (error) throw error
  return (data as Array<{ id: number }>).map((row) => row.id)
}

export async function exportAllDataToJson(): Promise<void> {
  await requireUserId()
  const [settings, bodyPartGroups, exercises, gyms, workouts, workoutExercises, workoutSets] = await Promise.all([
    listSettings(),
    listBodyPartGroups(),
    listExercises(),
    listGyms(),
    listWorkouts(),
    listWorkoutExercises(),
    listWorkoutSets(),
  ])
  const payload: BackupPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      bodyPartGroups,
      exercises,
      gyms,
      workouts: workouts.map((workout) => ({ ...workout, startTime: workout.startTime.toISOString(), endTime: workout.endTime?.toISOString() })),
      workoutExercises,
      workoutSets: workoutSets.map((set) => ({ ...set, timestamp: set.timestamp.toISOString() })),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `gymlog-backup-${formatBackupDate(new Date())}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function resetAllSupabaseData(): Promise<void> {
  await requireUserId()
  for (const table of ['workout_sets', 'workout_exercises', 'workouts', 'exercises', 'gyms', 'body_part_groups', 'settings'] as const) {
    const { error } = await supabase.from(table).delete().not('id', 'is', null)
    if (error) throw error
  }
}

export async function importAllDataFromJson(file: File): Promise<{ records: number }> {
  await requireUserId()
  const parsed = JSON.parse(await file.text()) as Partial<BackupPayload>
  if (parsed.schemaVersion !== 1 || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid backup: unsupported file format')
  }
  const data = parsed.data as BackupData
  const settings = ensureArray<Settings>(data.settings, 'settings')
  const bodyPartGroups = ensureArray<BodyPartGroup>(data.bodyPartGroups, 'bodyPartGroups')
  const exercises = ensureArray<Exercise>(data.exercises, 'exercises')
  const gyms = ensureArray<Gym>(data.gyms, 'gyms')
  const workouts = ensureArray<BackupData['workouts'][number]>(data.workouts, 'workouts')
  const workoutExercises = ensureArray<WorkoutExercise>(data.workoutExercises, 'workoutExercises')
  const workoutSets = ensureArray<BackupData['workoutSets'][number]>(data.workoutSets, 'workoutSets')

  await resetAllSupabaseData()
  if (settings[0]) {
    const { error } = await supabase.from('settings').insert({ gym_detection_radius: settings[0].gymDetectionRadius, theme: 'dark' })
    if (error) throw error
  }
  const bodyPartIds = await insertRows('body_part_groups', bodyPartGroups.map((group) => ({ name: group.name })))
  const bodyPartMap = new Map(bodyPartGroups.map((group, index) => [group.id!, bodyPartIds[index]]))
  const gymIds = await insertRows('gyms', gyms.map((gym) => ({ name: gym.name, abbreviation: gym.abbreviation, latitude: gym.latitude, longitude: gym.longitude })))
  const gymMap = new Map(gyms.map((gym, index) => [gym.id!, gymIds[index]]))
  const exerciseIds = await insertRows('exercises', exercises.map((exercise) => ({
    name: exercise.name,
    body_part_group_id: bodyPartMap.get(exercise.bodyPartGroupId)!,
    machine: exercise.machine === true,
    notes: exercise.notes ?? null,
  })))
  const exerciseMap = new Map(exercises.map((exercise, index) => [exercise.id!, exerciseIds[index]]))
  const workoutIds = await insertRows('workouts', workouts.map((workout) => ({
    gym_id: workout.gymId ? gymMap.get(workout.gymId) ?? null : null,
    start_time: workout.startTime,
    end_time: workout.endTime ?? null,
  })))
  const workoutMap = new Map(workouts.map((workout, index) => [workout.id!, workoutIds[index]]))
  const workoutExerciseIds = await insertRows('workout_exercises', workoutExercises.map((entry) => ({
    workout_id: workoutMap.get(entry.workoutId)!,
    exercise_id: exerciseMap.get(entry.exerciseId)!,
    exercise_order: entry.order,
  })))
  const workoutExerciseMap = new Map(workoutExercises.map((entry, index) => [entry.id!, workoutExerciseIds[index]]))
  await insertRows('workout_sets', workoutSets.map((set) => ({
    workout_exercise_id: workoutExerciseMap.get(set.workoutExerciseId)!,
    set_number: set.setNumber,
    weight: set.weight,
    reps: set.reps,
    performed_at: set.timestamp,
  })))

  return {
    records: settings.length + bodyPartGroups.length + exercises.length + gyms.length + workouts.length + workoutExercises.length + workoutSets.length,
  }
}
