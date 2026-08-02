import Dexie, { type EntityTable } from 'dexie'
import type {
  Settings,
  BodyPartGroup,
  Exercise,
  Gym,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types'

const db = new Dexie('GymLog') as Dexie & {
  settings: EntityTable<Settings, 'id'>
  bodyPartGroups: EntityTable<BodyPartGroup, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  gyms: EntityTable<Gym, 'id'>
  workouts: EntityTable<Workout, 'id'>
  workoutExercises: EntityTable<WorkoutExercise, 'id'>
  workoutSets: EntityTable<WorkoutSet, 'id'>
}

db.version(1).stores({
  settings: '++id',
  bodyPartGroups: '++id, name',
  exercises: '++id, name, bodyPartGroupId',
  gyms: '++id, name',
  workouts: '++id, gymId, startTime',
  workoutExercises: '++id, workoutId, exerciseId, order',
  workoutSets: '++id, workoutExerciseId, timestamp',
})

/** Seed default settings on first run */
db.on('populate', async () => {
  await db.settings.add({ gymDetectionRadius: 200, theme: 'dark' })
})

export { db }
