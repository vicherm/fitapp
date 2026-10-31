import { useEffect, useState } from 'react'
import { createWorkout, listOpenWorkouts, updateWorkout } from '../data/workouts'
import type { Workout } from '../db/types'
import { liveQuery } from 'dexie'

export interface WorkoutState {
  workout: Workout | null
  isLoading: boolean
  error: string | null
  startWorkout: (gymId: string) => Promise<void>
  assignGymToWorkout: (workoutId: string, gymId: string) => Promise<void>
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const now = new Date()
      const openWorkouts = await listOpenWorkouts()
      const currentDayWorkouts = openWorkouts
        .filter((candidate) => isSameLocalDay(candidate.startTime, now))
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

      return currentDayWorkouts[0] ?? null
    }).subscribe({
      next: (current) => {
        setWorkout(current)
        setError(null)
        setIsLoading(false)
      },
      error: (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'Unable to load workouts.')
        setIsLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [])

  async function startWorkout(gymId: string) {
    setWorkout(await createWorkout({ startTime: new Date(), gymId }))
  }

  async function assignGymToWorkout(workoutId: string, gymId: string) {
    const updated = await updateWorkout(workoutId, { gymId })
    setWorkout((current) => {
      if (!current || current.id !== workoutId) return current
      return updated
    })
  }

  return { workout, isLoading, error, startWorkout, assignGymToWorkout }
}
