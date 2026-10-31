import { useEffect, useState } from 'react'
import { listWorkoutExercises, listWorkoutSets, createWorkout, listOpenWorkouts, updateWorkout } from '../data/workouts'
import type { Workout } from '../db/types'
import { supabase } from '../lib/supabase'

export interface WorkoutState {
  workout: Workout | null
  isLoading: boolean
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

  useEffect(() => {
    async function loadWorkout() {
      const now = new Date()
      const openWorkouts = await listOpenWorkouts()
      const currentDayWorkouts = openWorkouts
        .filter((candidate) => isSameLocalDay(candidate.startTime, now))
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

      if (currentDayWorkouts[0]) {
        setWorkout(currentDayWorkouts[0])
      }

      // Any unfinished workouts from previous days are automatically closed at
      // the time of their last logged set.
      const previousDayWorkouts = openWorkouts.filter((candidate) => !isSameLocalDay(candidate.startTime, now))
      const previousDayWorkoutIds = previousDayWorkouts.map((candidate) => candidate.id!)
      const workoutExercises = previousDayWorkoutIds.length > 0
        ? await listWorkoutExercises(previousDayWorkoutIds)
        : []
      const workoutExerciseIds = workoutExercises.map((entry) => entry.id!)
      const sets = workoutExerciseIds.length > 0 ? await listWorkoutSets(workoutExerciseIds) : []
      const workoutIdByExerciseId = new Map(
        workoutExercises.map((entry) => [entry.id!, entry.workoutId]),
      )
      const lastSetByWorkoutId = new Map<string, Date>()

      for (const set of sets) {
        const workoutId = workoutIdByExerciseId.get(set.workoutExerciseId)
        if (workoutId === undefined) continue
        const lastSet = lastSetByWorkoutId.get(workoutId)
        if (!lastSet || set.timestamp > lastSet) lastSetByWorkoutId.set(workoutId, set.timestamp)
      }

      await Promise.all(previousDayWorkouts.map(async (candidate) => {
        await updateWorkout(candidate.id!, {
          endTime: lastSetByWorkoutId.get(candidate.id!) ?? candidate.startTime,
        })
        void supabase.functions.invoke('strava-upload-workout', {
          body: { workoutId: candidate.id },
        }).catch(() => undefined)
      }))
    }

    loadWorkout().finally(() => setIsLoading(false))
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

  return { workout, isLoading, startWorkout, assignGymToWorkout }
}
