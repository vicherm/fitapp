import { supabase } from '../lib/supabase'
import { mapWorkout, mapWorkoutExercise, mapWorkoutSet } from './mappers'
import type { Workout, WorkoutExercise, WorkoutSet } from '../db/types'

export async function listWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase.from('workouts').select('*').order('start_time')
  if (error) throw error
  return data.map(mapWorkout)
}

export async function getWorkout(id: number): Promise<Workout | null> {
  const { data, error } = await supabase.from('workouts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapWorkout(data) : null
}

export async function listWorkoutExercises(workoutIds?: number[]): Promise<WorkoutExercise[]> {
  let query = supabase.from('workout_exercises').select('*')
  if (workoutIds && workoutIds.length > 0) query = query.in('workout_id', workoutIds)
  const { data, error } = await query.order('exercise_order')
  if (error) throw error
  return data.map(mapWorkoutExercise)
}

export async function listWorkoutSets(workoutExerciseIds?: number[]): Promise<WorkoutSet[]> {
  let query = supabase.from('workout_sets').select('*')
  if (workoutExerciseIds && workoutExerciseIds.length > 0) query = query.in('workout_exercise_id', workoutExerciseIds)
  const { data, error } = await query.order('performed_at')
  if (error) throw error
  return data.map(mapWorkoutSet)
}