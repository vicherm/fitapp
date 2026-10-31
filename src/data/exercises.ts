import { createLocalRow, deleteLocalRow, getLocalRow, listLocalRows, updateLocalRow } from '../db/local'
import { mapExercise } from './mappers'
import type { Exercise } from '../db/types'

export async function listExercises(includeDeleted = false): Promise<Exercise[]> {
  return (await listLocalRows('exercises', includeDeleted)).sort((a, b) => a.name.localeCompare(b.name)).map(mapExercise)
}

export async function getExercise(id: string, includeDeleted = false): Promise<Exercise | null> {
  const row = await getLocalRow('exercises', id, includeDeleted)
  return row ? mapExercise(row) : null
}

export async function createExercise(input: Omit<Exercise, 'id' | 'isDeleted'>): Promise<Exercise> {
  return mapExercise(await createLocalRow('exercises', {
    name: input.name, body_part_group_id: input.bodyPartGroupId, machine: input.machine,
    notes: input.notes ?? null, strava_exercise_type: input.stravaExerciseType ?? null, is_deleted: false,
  }))
}

export async function updateExercise(id: string, input: Partial<Omit<Exercise, 'id'>>): Promise<Exercise> {
  return mapExercise(await updateLocalRow('exercises', id, {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.bodyPartGroupId === undefined ? {} : { body_part_group_id: input.bodyPartGroupId }),
    ...(input.machine === undefined ? {} : { machine: input.machine }),
    ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
    ...(input.stravaExerciseType === undefined ? {} : { strava_exercise_type: input.stravaExerciseType ?? null }),
  }))
}

export async function deleteExercise(id: string): Promise<void> {
  await deleteLocalRow('exercises', id)
}
