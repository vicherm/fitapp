export interface Settings {
  id: string
  gymDetectionRadius: number // metres
  theme: 'dark'
}

export interface BodyPartGroup {
  id: string
  name: string
}

export interface Exercise {
  id: string
  name: string
  bodyPartGroupId: string
  machine: boolean
  notes?: string
  stravaExerciseType?: string
}

export interface Gym {
  id: string
  name: string
  abbreviation: string
  latitude: number
  longitude: number
}

export interface Workout {
  id: string
  gymId?: string
  note?: string
  startTime: Date
  endTime?: Date
}

export interface WorkoutExercise {
  id: string
  workoutId: string
  exerciseId: string
  order: number
}

export interface WorkoutSet {
  id: string
  workoutExerciseId: string
  setNumber: number
  weight: number
  reps: number
  timestamp: Date
}
