import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Workout } from '../db/types'

export interface WorkoutState {
  workout: Workout | null
  isLoading: boolean
  startWorkout: (gymId: number) => Promise<void>
  assignGymToWorkout: (workoutId: number, gymId: number) => Promise<void>
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function useWorkout(): WorkoutState {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadWorkout() {
      const now = new Date()
      const openWorkouts = await db.workouts
        .filter((candidate) => !candidate.endTime)
        .toArray()
      const currentDayWorkouts = openWorkouts
        .filter((candidate) => isSameLocalDay(candidate.startTime, now))
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

      if (currentDayWorkouts[0]) {
        setWorkout(currentDayWorkouts[0])
      }

      // Any unfinished workouts from previous days are automatically closed at
      // the time of their last logged set.
      await Promise.all(
        openWorkouts
          .filter((candidate) => !isSameLocalDay(candidate.startTime, now))
          .map(async (candidate) => {
            const workoutExercises = await db.workoutExercises
              .where('workoutId')
              .equals(candidate.id!)
              .toArray()
            const workoutExerciseIds = workoutExercises.map((entry) => entry.id!)
            const sets = workoutExerciseIds.length > 0
              ? await db.workoutSets.where('workoutExerciseId').anyOf(workoutExerciseIds).toArray()
              : []
            const lastSet = sets.reduce<Date | undefined>(
              (latest, set) => (!latest || set.timestamp > latest ? set.timestamp : latest),
              undefined,
            )
            await db.workouts.update(candidate.id!, { endTime: lastSet ?? candidate.startTime })
          }),
      )
    }

    loadWorkout().finally(() => setIsLoading(false))
  }, [])

  async function startWorkout(gymId: number) {
    const id = await db.workouts.add({ startTime: new Date(), gymId })
    setWorkout(await db.workouts.get(id) ?? null)
  }

  async function assignGymToWorkout(workoutId: number, gymId: number) {
    await db.workouts.update(workoutId, { gymId })
    setWorkout((current) => {
      if (!current || current.id !== workoutId) return current
      return { ...current, gymId }
    })
  }

  return { workout, isLoading, startWorkout, assignGymToWorkout }
}
