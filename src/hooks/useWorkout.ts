import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Workout } from '../db/types'

export interface WorkoutState {
  workout: Workout | null
  isLoading: boolean
  startWorkout: () => Promise<void>
  finishWorkout: () => Promise<void>
}

export default function useWorkout(): WorkoutState {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Resume the most recent unfinished workout, if any
    db.workouts
      .orderBy('startTime')
      .reverse()
      .first()
      .then((latest) => {
        if (latest && !latest.endTime) setWorkout(latest)
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function startWorkout() {
    const id = await db.workouts.add({ startTime: new Date() })
    setWorkout(await db.workouts.get(id) ?? null)
  }

  async function finishWorkout() {
    if (!workout?.id) return
    const endTime = new Date()
    await db.workouts.update(workout.id, { endTime })
    setWorkout((w) => (w ? { ...w, endTime } : null))
  }

  return { workout, isLoading, startWorkout, finishWorkout }
}
