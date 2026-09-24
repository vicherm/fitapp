import type {
  BodyPartGroup,
  Exercise,
  Gym,
  Settings,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../db/types'
import type { Database } from '../lib/database.types'

type Tables = Database['public']['Tables']

export function mapSettings(row: Tables['settings']['Row']): Settings {
  return {
    id: row.id,
    gymDetectionRadius: row.gym_detection_radius,
    theme: row.theme,
  }
}

export function mapBodyPartGroup(row: Tables['body_part_groups']['Row']): BodyPartGroup {
  return { id: row.id, name: row.name }
}

export function mapExercise(row: Tables['exercises']['Row']): Exercise {
  return {
    id: row.id,
    name: row.name,
    bodyPartGroupId: row.body_part_group_id,
    machine: row.machine,
    notes: row.notes ?? undefined,
    stravaExerciseType: row.strava_exercise_type ?? undefined,
  }
}

export function mapGym(row: Tables['gyms']['Row']): Gym {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    latitude: row.latitude,
    longitude: row.longitude,
  }
}

export function mapWorkout(row: Tables['workouts']['Row']): Workout {
  return {
    id: row.id,
    gymId: row.gym_id ?? undefined,
    startTime: new Date(row.start_time),
    endTime: row.end_time ? new Date(row.end_time) : undefined,
  }
}

export function mapWorkoutExercise(row: Tables['workout_exercises']['Row']): WorkoutExercise {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    order: row.exercise_order,
  }
}

export function mapWorkoutSet(row: Tables['workout_sets']['Row']): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workout_exercise_id,
    setNumber: row.set_number,
    weight: row.weight,
    reps: row.reps,
    timestamp: new Date(row.performed_at),
  }
}