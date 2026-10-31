import type {
  BodyPartGroup,
  Exercise,
  Gym,
  Settings,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../db/types'
import type { ServerRow } from '../db/local'

export function mapSettings(row: ServerRow<'settings'>): Settings {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    gymDetectionRadius: row.gym_detection_radius,
    syncCooldownSeconds: row.sync_cooldown_seconds,
    theme: row.theme,
  }
}

export function mapBodyPartGroup(row: ServerRow<'body_part_groups'>): BodyPartGroup {
  return { id: row.id, isDeleted: row.is_deleted, name: row.name }
}

export function mapExercise(row: ServerRow<'exercises'>): Exercise {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    name: row.name,
    bodyPartGroupId: row.body_part_group_id,
    machine: row.machine,
    notes: row.notes ?? undefined,
    stravaExerciseType: row.strava_exercise_type ?? undefined,
  }
}

export function mapGym(row: ServerRow<'gyms'>): Gym {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    name: row.name,
    abbreviation: row.abbreviation,
    latitude: row.latitude,
    longitude: row.longitude,
  }
}

export function mapWorkout(row: ServerRow<'workouts'>): Workout {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    gymId: row.gym_id ?? undefined,
    note: row.note ?? undefined,
    startTime: new Date(row.start_time),
    endTime: row.end_time ? new Date(row.end_time) : undefined,
  }
}

export function mapWorkoutExercise(row: ServerRow<'workout_exercises'>): WorkoutExercise {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    order: row.exercise_order,
  }
}

export function mapWorkoutSet(row: ServerRow<'workout_sets'>): WorkoutSet {
  return {
    id: row.id,
    isDeleted: row.is_deleted,
    workoutExerciseId: row.workout_exercise_id,
    setNumber: row.set_number,
    weight: row.weight,
    reps: row.reps,
    timestamp: new Date(row.performed_at),
  }
}