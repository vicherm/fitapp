import { createLocalRow, deleteLocalRow, getLocalDatabase, getLocalRow, listLocalRows, nextUpdatedAt, updateLocalRow, validateSnapshot, type LocalDatabase } from '../db/local'
import { mapWorkout, mapWorkoutExercise, mapWorkoutSet } from './mappers'
import type { Workout, WorkoutExercise, WorkoutSet } from '../db/types'

export async function listWorkouts(includeDeleted = false): Promise<Workout[]> {
  return (await listLocalRows('workouts', includeDeleted)).sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)).map(mapWorkout)
}

export async function listOpenWorkouts(): Promise<Workout[]> {
  return (await listWorkouts()).filter((row) => row.endTime === undefined)
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const row = await getLocalRow('workouts', id)
  return row ? mapWorkout(row) : null
}

export async function listWorkoutExercises(workoutIds?: string[], includeDeleted = false): Promise<WorkoutExercise[]> {
  return (await listLocalRows('workout_exercises', includeDeleted))
    .filter((row) => !workoutIds || workoutIds.includes(row.workout_id))
    .sort((a, b) => a.exercise_order - b.exercise_order).map(mapWorkoutExercise)
}

export async function listWorkoutSets(workoutExerciseIds?: string[], includeDeleted = false): Promise<WorkoutSet[]> {
  return (await listLocalRows('workout_sets', includeDeleted))
    .filter((row) => !workoutExerciseIds || workoutExerciseIds.includes(row.workout_exercise_id))
    .sort((a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at)).map(mapWorkoutSet)
}

export async function createWorkout(input: Pick<Workout, 'gymId' | 'startTime'>): Promise<Workout> {
  return mapWorkout(await createLocalRow('workouts', {
    gym_id: input.gymId ?? null, start_time: input.startTime.toISOString(),
    end_time: null, note: null, is_deleted: false,
  }))
}

export async function updateWorkout(id: string, input: Partial<Pick<Workout, 'gymId' | 'note' | 'startTime' | 'endTime'>>): Promise<Workout> {
  return mapWorkout(await updateLocalRow('workouts', id, {
    ...('gymId' in input ? { gym_id: input.gymId ?? null } : {}),
    ...(input.note === undefined ? {} : { note: input.note.trim() || null }),
    ...(input.startTime === undefined ? {} : { start_time: input.startTime.toISOString() }),
    ...('endTime' in input ? { end_time: input.endTime?.toISOString() ?? null } : {}),
  }))
}

export async function deleteWorkout(id: string): Promise<void> {
  await deleteLocalRow('workouts', id)
}

export async function createWorkoutExercise(input: Omit<WorkoutExercise, 'id' | 'isDeleted'>): Promise<WorkoutExercise> {
  return mapWorkoutExercise(await createLocalRow('workout_exercises', {
    workout_id: input.workoutId, exercise_id: input.exerciseId, exercise_order: input.order, is_deleted: false,
  }))
}

export async function getWorkoutExercise(workoutId: string, exerciseId: string): Promise<WorkoutExercise | null> {
  return (await listWorkoutExercises([workoutId])).find((row) => row.exerciseId === exerciseId) ?? null
}

export async function updateWorkoutSet(id: string, input: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'setNumber' | 'workoutExerciseId'>>): Promise<WorkoutSet> {
  return mapWorkoutSet(await updateLocalRow('workout_sets', id, {
    ...(input.weight === undefined ? {} : { weight: input.weight }),
    ...(input.reps === undefined ? {} : { reps: input.reps }),
    ...(input.setNumber === undefined ? {} : { set_number: input.setNumber }),
    ...(input.workoutExerciseId === undefined ? {} : { workout_exercise_id: input.workoutExerciseId }),
  }))
}

export async function createWorkoutSet(input: Omit<WorkoutSet, 'id' | 'isDeleted'>): Promise<WorkoutSet> {
  return mapWorkoutSet(await createLocalRow('workout_sets', {
    workout_exercise_id: input.workoutExerciseId, set_number: input.setNumber,
    weight: input.weight, reps: input.reps, performed_at: input.timestamp.toISOString(), is_deleted: false,
  }))
}

export async function deleteWorkoutSet(id: string): Promise<void> {
  await deleteLocalRow('workout_sets', id)
}

export async function deleteWorkoutExercise(id: string): Promise<void> {
  await deleteLocalRow('workout_exercises', id)
}

export async function resequenceWorkoutSets(ids: string[]): Promise<void> {
  const db = getLocalDatabase()
  await db.transaction('rw', db.tables, async () => {
    await numberSets(db, ids)
    validateSnapshot(await db.snapshot(), db.userId)
  })
}

async function numberSets(db: LocalDatabase, ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    const row = await db.rows('workout_sets').get(id)
    if (!row || row.is_deleted) throw new Error('Set not found.')
    if (row.set_number !== index + 1) {
      await db.rows('workout_sets').put({
        ...row, set_number: index + 1, updated_at: nextUpdatedAt(row.updated_at), sync_status: 'pending',
      })
    }
  }
}

export async function moveWorkoutSet(id: string, targetId: string): Promise<void> {
  const db = getLocalDatabase()
  await db.transaction('rw', db.tables, async () => {
    const set = await db.rows('workout_sets').get(id)
    const target = await db.rows('workout_exercises').get(targetId)
    const source = set ? await db.rows('workout_exercises').get(set.workout_exercise_id) : undefined
    if (!set || set.is_deleted || !source || !target || target.is_deleted || source.workout_id !== target.workout_id) {
      throw new Error('Cannot move this set to the selected workout exercise.')
    }
    await db.rows('workout_sets').put({
      ...set, workout_exercise_id: targetId, updated_at: nextUpdatedAt(set.updated_at), sync_status: 'pending',
    })
    const emptyEntries: string[] = []
    for (const entryId of new Set([source.id, targetId])) {
      const rows = (await db.rows('workout_sets').where('workout_exercise_id').equals(entryId).toArray())
        .filter((row) => !row.is_deleted).sort((a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at))
      await numberSets(db, rows.map((row) => row.id))
      if (rows.length === 0) emptyEntries.push(entryId)
    }
    for (const entryId of emptyEntries) await deleteWorkoutExercise(entryId)
    validateSnapshot(await db.snapshot(), db.userId)
  })
}
