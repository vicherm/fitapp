export interface Settings {
  id?: number
  gymDetectionRadius: number // metres
  theme: 'dark'
}

export interface BodyPartGroup {
  id?: number
  name: string
}

export interface Exercise {
  id?: number
  name: string
  bodyPartGroupId: number
  notes?: string
}

export interface Gym {
  id?: number
  name: string
  latitude: number
  longitude: number
}

export interface Workout {
  id?: number
  gymId?: number
  startTime: Date
  endTime?: Date
}

export interface WorkoutExercise {
  id?: number
  workoutId: number
  exerciseId: number
  order: number
}

export interface WorkoutSet {
  id?: number
  workoutExerciseId: number
  setNumber: number
  weight: number
  reps: number
  timestamp: Date
}
