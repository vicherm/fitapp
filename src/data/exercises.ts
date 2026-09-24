import { supabase } from '../lib/supabase'
import { mapExercise } from './mappers'
import type { Exercise } from '../db/types'

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name')
  if (error) throw error
  return data.map(mapExercise)
}

export async function getExercise(id: number): Promise<Exercise | null> {
  const { data, error } = await supabase.from('exercises').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapExercise(data) : null
}

export async function createExercise(input: Omit<Exercise, 'id'>): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: input.name,
      body_part_group_id: input.bodyPartGroupId,
      machine: input.machine,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapExercise(data)
}

export async function updateExercise(id: number, input: Partial<Omit<Exercise, 'id'>>): Promise<Exercise> {
  const payload = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.bodyPartGroupId === undefined ? {} : { body_part_group_id: input.bodyPartGroupId }),
    ...(input.machine === undefined ? {} : { machine: input.machine }),
    ...(input.notes === undefined ? {} : { notes: input.notes ?? null }),
  }
  const { data, error } = await supabase.from('exercises').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return mapExercise(data)
}

export async function deleteExercise(id: number): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (error) throw error
}