import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import type { BodyPartGroup, Exercise, Gym, Workout, WorkoutSet } from '../db/types'
import type { HistoryViewState } from './WorkoutHistoryPage'
import './WorkoutSummaryPage.css'

interface SummaryExercise {
  bodyPartName: string
  exerciseName: string
  sets: WorkoutSet[]
}

interface WorkoutSummary {
  workout: Workout
  gym: Gym | null
  exercises: SummaryExercise[]
}

function formatDate(input: Date): string {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(input: Date): string {
  const hours = String(input.getHours()).padStart(2, '0')
  const minutes = String(input.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatDuration(startTime: Date, endTime?: Date): string {
  const end = endTime ?? new Date()
  const minutes = Math.max(0, Math.floor((end.getTime() - startTime.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

async function loadSummary(workoutId: number): Promise<WorkoutSummary | null> {
  const workout = await db.workouts.get(workoutId)
  if (!workout) return null

  const [gym, workoutExercises] = await Promise.all([
    workout.gymId ? db.gyms.get(workout.gymId) : Promise.resolve(undefined),
    db.workoutExercises.where('workoutId').equals(workoutId).toArray(),
  ])
  const orderedWorkoutExercises = workoutExercises.sort((left, right) => left.order - right.order)
  const exerciseIds = orderedWorkoutExercises.map((workoutExercise) => workoutExercise.exerciseId)
  const exercises = exerciseIds.length > 0 ? await db.exercises.where('id').anyOf(exerciseIds).toArray() : []
  const groupIds = Array.from(new Set(exercises.map((exercise) => exercise.bodyPartGroupId)))
  const groups = groupIds.length > 0 ? await db.bodyPartGroups.where('id').anyOf(groupIds).toArray() : []
  const exerciseById = new Map<number, Exercise>(exercises.map((exercise) => [exercise.id!, exercise]))
  const groupById = new Map<number, BodyPartGroup>(groups.map((group) => [group.id!, group]))

  const summaryExercises = await Promise.all(
    orderedWorkoutExercises.map(async (workoutExercise) => {
      const exercise = exerciseById.get(workoutExercise.exerciseId)
      const sets = await db.workoutSets
        .where('workoutExerciseId')
        .equals(workoutExercise.id!)
        .sortBy('setNumber')

      return {
        bodyPartName: exercise ? groupById.get(exercise.bodyPartGroupId)?.name ?? 'Unassigned' : 'Unknown',
        exerciseName: exercise?.name ?? 'Unknown exercise',
        sets,
      }
    }),
  )

  return { workout, gym: gym ?? null, exercises: summaryExercises }
}

export default function WorkoutSummaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const historyView = (location.state as { historyView?: HistoryViewState } | null)?.historyView
  const { id } = useParams<{ id: string }>()
  const workoutId = Number(id)
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!Number.isInteger(workoutId) || workoutId <= 0) {
      setIsLoading(false)
      return
    }

    void loadSummary(workoutId).then((nextSummary) => {
      setSummary(nextSummary)
      setIsLoading(false)
    })
  }, [workoutId])

  if (isLoading) return <div className="ws-loading">Loading...</div>

  if (!summary) {
    return (
      <main className="ws ws-empty-page">
        <button
          className="ws-back"
          onClick={() => navigate('/history', { state: { historyView } })}
          aria-label="Back to History"
        >
          ←
        </button>
        <p>Workout not found.</p>
      </main>
    )
  }

  const { workout } = summary

  return (
    <main className="ws">
      <header className="ws-header">
        <button
          className="ws-back"
          onClick={() => navigate('/history', { state: { historyView } })}
          aria-label="Back to History"
        >
          ←
        </button>
        <div>
          <p className="ws-kicker">Workout Summary</p>
          <h1>{formatDate(workout.startTime)}</h1>
        </div>
      </header>

      <section className="ws-meta" aria-label="Workout details">
        <div>
          <span>Gym</span>
          <strong>{summary.gym?.name ?? 'Unknown gym'}</strong>
        </div>
        <div>
          <span>Start</span>
          <strong>{formatTime(workout.startTime)}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{formatDuration(workout.startTime, workout.endTime)}</strong>
        </div>
      </section>

      <section className="ws-exercises" aria-label="Exercises">
        {summary.exercises.length === 0 ? (
          <p className="ws-no-exercises">No exercises logged.</p>
        ) : (
          summary.exercises.map((exercise, index) => (
            <article className="ws-exercise" key={`${exercise.exerciseName}-${index}`}>
              <div className="ws-exercise-heading">
                <span className="ws-body-part">{exercise.bodyPartName}</span>
                <h2>{exercise.exerciseName}</h2>
              </div>
              <div className="ws-sets">
                {exercise.sets.length > 0 ? (
                  exercise.sets.map((set) => (
                    <div className="ws-set-row" key={set.id}>
                      {set.weight} kg × {set.reps}
                    </div>
                  ))
                ) : (
                  <div className="ws-set-row">No sets logged</div>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
