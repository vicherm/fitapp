import { supabase } from '../lib/supabase'
import { mapExercise } from './mappers'
import type { Exercise } from '../db/types'

export async function listExercises(includeDeleted = false): Promise<Exercise[]> {
  let query = supabase.from('exercises').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.order('name')
  if (error) throw error
  return data.map(mapExercise)
}

export async function getExercise(id: string, includeDeleted = false): Promise<Exercise | null> {
  let query = supabase.from('exercises').select('*').eq('id', id)
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapExercise(data) : null
}

export async function createExercise(input: Omit<Exercise, 'id' | 'isDeleted'>): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      id: crypto.randomUUID(),
      is_deleted: false,
      name: input.name,
      body_part_group_id: input.bodyPartGroupId,
      machine: input.machine,
      notes: input.notes ?? null,
      strava_exercise_type: input.stravaExerciseType ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapExercise(data)
}

export async function updateExercise(id: string, input: Partial<Omit<Exercise, 'id'>>): Promise<Exercise> {
  const payload = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.bodyPartGroupId === undefined ? {} : { body_part_group_id: input.bodyPartGroupId }),
    ...(input.machine === undefined ? {} : { machine: input.machine }),
    ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
    ...(input.stravaExerciseType === undefined ? {} : { strava_exercise_type: input.stravaExerciseType ?? null }),
  }
  const { data, error } = await supabase.from('exercises').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return mapExercise(data)
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}