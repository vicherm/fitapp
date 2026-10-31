export interface Settings {
  syncCooldownSeconds: number
  id: string
  isDeleted: boolean
  gymDetectionRadius: number // metres
  theme: 'dark'
}

export interface BodyPartGroup {
  id: string
  isDeleted: boolean
  name: string
}

export interface Exercise {
  id: string
  isDeleted: boolean
  name: string
  bodyPartGroupId: string
  machine: boolean
  notes?: string
  stravaExerciseType?: string
}

export interface Gym {
  id: string
  isDeleted: boolean
  name: string
  abbreviation: string
  latitude: number
  longitude: number
}

export interface Workout {
  id: string
  isDeleted: boolean
  gymId?: string
  note?: string
  startTime: Date
  endTime?: Date
}

export interface WorkoutExercise {
  id: string
  isDeleted: boolean
  workoutId: string
  exerciseId: string
  order: number
}

export interface WorkoutSet {
  id: string
  isDeleted: boolean
  workoutExerciseId: string
  setNumber: number
  weight: number
  reps: number
  timestamp: Date
}
