import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Workout } from '../db/types'

export interface WorkoutState {
  workout: Workout | null
  isLoading: boolean
  startWorkout: () => Promise<void>
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function endOfLocalDay(input: Date): Date {
  const value = new Date(input)
  value.setHours(23, 59, 59, 999)
  return value
}

export default function useWorkout(): WorkoutState {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadWorkout() {
      const latest = await db.workouts.orderBy('startTime').reverse().first()
      if (!latest || latest.endTime) return

      const now = new Date()
      if (isSameLocalDay(latest.startTime, now)) {
        setWorkout(latest)
        return
      }

      // Any unfinished workout from a previous day is automatically closed.
      await db.workouts.update(latest.id!, { endTime: endOfLocalDay(latest.startTime) })
    }

    loadWorkout().finally(() => setIsLoading(false))
  }, [])

  async function startWorkout() {
    const id = await db.workouts.add({ startTime: new Date() })
    setWorkout(await db.workouts.get(id) ?? null)
  }

  return { workout, isLoading, startWorkout }
}
