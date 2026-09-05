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

db.version(2)
  .stores({
    settings: '++id',
    bodyPartGroups: '++id, name',
    exercises: '++id, name, bodyPartGroupId',
    gyms: '++id, name, abbreviation',
    workouts: '++id, gymId, startTime',
    workoutExercises: '++id, workoutId, exerciseId, order',
    workoutSets: '++id, workoutExerciseId, timestamp',
  })
  .upgrade(async (tx) => {
    const gymsTable = tx.table<Gym, number>('gyms')
    const gyms = await gymsTable.toArray()

    for (const gym of gyms) {
      const abbreviation = gym.abbreviation?.trim() || gym.name.slice(0, 3).toUpperCase()
      await gymsTable.update(gym.id!, { abbreviation })
    }
  })

db.version(3)
  .stores({
    settings: '++id',
    bodyPartGroups: '++id, name',
    exercises: '++id, name, bodyPartGroupId',
    gyms: '++id, name, abbreviation',
    workouts: '++id, gymId, startTime',
    workoutExercises: '++id, workoutId, exerciseId, order',
    workoutSets: '++id, workoutExerciseId, timestamp',
  })
  .upgrade(async (tx) => {
    const exercisesTable = tx.table<Exercise, number>('exercises')
    const exercises = await exercisesTable.toArray()

    for (const exercise of exercises) {
      await exercisesTable.update(exercise.id!, { machine: exercise.machine === true })
    }
  })

/** Seed default settings on first run */
db.on('populate', async () => {
  await db.settings.add({ gymDetectionRadius: 200, theme: 'dark' })
})

async function removeEmptyWorkoutExercises(workoutId?: number): Promise<void> {
  const workoutExercises = workoutId === undefined
    ? await db.workoutExercises.toArray()
    : await db.workoutExercises.where('workoutId').equals(workoutId).toArray()
  if (workoutExercises.length === 0) return

  const workoutExerciseIds = workoutExercises.map((entry) => entry.id!)
  const workoutSets = await db.workoutSets.where('workoutExerciseId').anyOf(workoutExerciseIds).toArray()
  const workoutExerciseIdsWithSets = new Set(workoutSets.map((set) => set.workoutExerciseId))
  await db.workoutExercises.bulkDelete(
    workoutExercises
      .filter((entry) => !workoutExerciseIdsWithSets.has(entry.id!))
      .map((entry) => entry.id!),
  )

  if (workoutId !== undefined) {
    const remainingExercises = await db.workoutExercises.where('workoutId').equals(workoutId).count()
    if (remainingExercises === 0) await db.workouts.delete(workoutId)
    return
  }

  const workoutIdsWithExercises = new Set((await db.workoutExercises.toArray()).map((entry) => entry.workoutId))
  const emptyWorkoutIds = (await db.workouts.toArray())
    .filter((workout) => !workoutIdsWithExercises.has(workout.id!))
    .map((workout) => workout.id!)
  await db.workouts.bulkDelete(emptyWorkoutIds)
}

export { db, removeEmptyWorkoutExercises }
