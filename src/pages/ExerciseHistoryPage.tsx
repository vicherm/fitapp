import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import type { Exercise, Workout, WorkoutSet } from '../db/types'
import './ExerciseHistoryPage.css'

interface WorkoutGroup {
  workout: Workout
  sets: WorkoutSet[]
}

function formatWorkoutDate(input: Date): string {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSetTime(input: Date): string {
  const hours = String(input.getHours()).padStart(2, '0')
  const minutes = String(input.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export default function ExerciseHistoryPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const exerciseId = useMemo(() => Number(id), [id])
  const [isLoading, setIsLoading] = useState(true)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [groups, setGroups] = useState<WorkoutGroup[]>([])

  useEffect(() => {
    async function load() {
      if (!Number.isFinite(exerciseId) || exerciseId <= 0) {
        setIsLoading(false)
        return
      }

      const ex = await db.exercises.get(exerciseId)
      setExercise(ex ?? null)

      if (!ex) {
        setGroups([])
        setIsLoading(false)
        return
      }

      const workoutExercises = await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray()

      if (workoutExercises.length === 0) {
        setGroups([])
        setIsLoading(false)
        return
      }

      const workoutExerciseIds = workoutExercises.map((we) => we.id!)
      const allSets = await db.workoutSets.where('workoutExerciseId').anyOf(workoutExerciseIds).toArray()

      const workoutIds = Array.from(new Set(workoutExercises.map((we) => we.workoutId)))
      const workouts = await db.workouts.where('id').anyOf(workoutIds).toArray()
      const workoutById = new Map(workouts.map((workout) => [workout.id!, workout]))
      const workoutIdByWorkoutExerciseId = new Map(workoutExercises.map((we) => [we.id!, we.workoutId]))

      const setsByWorkoutId = new Map<number, WorkoutSet[]>()
      for (const set of allSets) {
        const workoutId = workoutIdByWorkoutExerciseId.get(set.workoutExerciseId)
        if (!workoutId) continue

        if (!setsByWorkoutId.has(workoutId)) {
          setsByWorkoutId.set(workoutId, [])
        }
        setsByWorkoutId.get(workoutId)!.push(set)
      }

      const grouped = Array.from(setsByWorkoutId.entries())
        .map(([workoutId, sets]) => ({
          workout: workoutById.get(workoutId),
          sets: [...sets].sort((a, b) => {
            if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
            return a.timestamp.getTime() - b.timestamp.getTime()
          }),
        }))
        .filter((group): group is WorkoutGroup => Boolean(group.workout))
        .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime())

      setGroups(grouped)
      setIsLoading(false)
    }

    load()
  }, [exerciseId])

  if (isLoading) {
    return <div className="eh-loading">Loading…</div>
  }

  return (
    <div className="eh">
      <header className="eh-header">
        <button className="eh-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="eh-title-wrap">
          <h1 className="eh-title">Exercise History</h1>
          <p className="eh-subtitle">{exercise?.name ?? 'Unknown exercise'}</p>
        </div>
      </header>

      <main className="eh-list">
        {groups.length === 0 ? (
          <p className="eh-empty">No previous sets found.</p>
        ) : (
          groups.map((group) => (
            <section key={group.workout.id} className="eh-workout">
              <h2>{formatWorkoutDate(group.workout.startTime)}</h2>
              {group.sets.map((set) => (
                <div key={set.id} className="eh-row">
                  <span>{set.weight} × {set.reps}</span>
                  <span>{formatSetTime(set.timestamp)}</span>
                </div>
              ))}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
