import { supabase } from '../lib/supabase'
import { mapWorkout, mapWorkoutExercise, mapWorkoutSet } from './mappers'
import type { Workout, WorkoutExercise, WorkoutSet } from '../db/types'

export async function listWorkouts(includeDeleted = false): Promise<Workout[]> {
  let query = supabase.from('workouts').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  const { data, error } = await query.order('start_time')
  if (error) throw error
  return data.map(mapWorkout)
}

export async function listOpenWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase.from('workouts').select('*').eq('is_deleted', false).is('end_time', null).order('start_time')
  if (error) throw error
  return data.map(mapWorkout)
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const { data, error } = await supabase.from('workouts').select('*').eq('id', id).eq('is_deleted', false).maybeSingle()
  if (error) throw error
  return data ? mapWorkout(data) : null
}

export async function listWorkoutExercises(workoutIds?: string[], includeDeleted = false): Promise<WorkoutExercise[]> {
  let query = supabase.from('workout_exercises').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  if (workoutIds && workoutIds.length > 0) query = query.in('workout_id', workoutIds)
  const { data, error } = await query.order('exercise_order')
  if (error) throw error
  return data.map(mapWorkoutExercise)
}

export async function listWorkoutSets(workoutExerciseIds?: string[], includeDeleted = false): Promise<WorkoutSet[]> {
  let query = supabase.from('workout_sets').select('*')
  if (!includeDeleted) query = query.eq('is_deleted', false)
  if (workoutExerciseIds && workoutExerciseIds.length > 0) query = query.in('workout_exercise_id', workoutExerciseIds)
  const { data, error } = await query.order('performed_at')
  if (error) throw error
  return data.map(mapWorkoutSet)
}

export async function createWorkout(input: Pick<Workout, 'gymId' | 'startTime'>): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ id: crypto.randomUUID(), is_deleted: false, gym_id: input.gymId ?? null, start_time: input.startTime.toISOString() })
    .select('*')
    .single()
  if (error) throw error
  return mapWorkout(data)
}

export async function updateWorkout(id: string, input: Partial<Pick<Workout, 'gymId' | 'note' | 'startTime' | 'endTime'>>): Promise<Workout> {
  const payload = {
    ...(input.gymId === undefined ? {} : { gym_id: input.gymId ?? null }),
    ...(input.note === undefined ? {} : { note: input.note.trim() || null }),
    ...(input.startTime === undefined ? {} : { start_time: input.startTime.toISOString() }),
    ...(input.endTime === undefined ? {} : { end_time: input.endTime?.toISOString() ?? null }),
  }
  const { data, error } = await supabase.from('workouts').update(payload).eq('id', id).eq('is_deleted', false).select('*').single()
  if (error) throw error
  return mapWorkout(data)
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}

export async function createWorkoutExercise(input: Omit<WorkoutExercise, 'id' | 'isDeleted'>): Promise<WorkoutExercise> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({ id: crypto.randomUUID(), is_deleted: false, workout_id: input.workoutId, exercise_id: input.exerciseId, exercise_order: input.order })
    .select('*')
    .single()
  if (error) throw error
  return mapWorkoutExercise(data)
}

export async function getWorkoutExercise(workoutId: string, exerciseId: string): Promise<WorkoutExercise | null> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .eq('exercise_id', exerciseId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error) throw error
  return data ? mapWorkoutExercise(data) : null
}

export async function updateWorkoutSet(id: string, input: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'setNumber' | 'workoutExerciseId'>>): Promise<WorkoutSet> {
  const payload = {
    ...(input.weight === undefined ? {} : { weight: input.weight }),
    ...(input.reps === undefined ? {} : { reps: input.reps }),
    ...(input.setNumber === undefined ? {} : { set_number: input.setNumber }),
    ...(input.workoutExerciseId === undefined ? {} : { workout_exercise_id: input.workoutExerciseId }),
  }
  const { data, error } = await supabase.from('workout_sets').update(payload).eq('id', id).eq('is_deleted', false).select('*').single()
  if (error) throw error
  return mapWorkoutSet(data)
}

export async function createWorkoutSet(input: Omit<WorkoutSet, 'id' | 'isDeleted'>): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('workout_sets')
    .insert({
      id: crypto.randomUUID(),
      is_deleted: false,
      workout_exercise_id: input.workoutExerciseId,
      set_number: input.setNumber,
      weight: input.weight,
      reps: input.reps,
      performed_at: input.timestamp.toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  return mapWorkoutSet(data)
}

export async function deleteWorkoutSet(id: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}

export async function deleteWorkoutExercise(id: string): Promise<void> {
  const { error } = await supabase.from('workout_exercises').update({ is_deleted: true }).eq('id', id).eq('is_deleted', false)
  if (error) throw error
}