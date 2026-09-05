import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { db, removeEmptyWorkoutExercises } from '../db/db'
import type { BodyPartGroup, Exercise, Gym, Workout, WorkoutSet } from '../db/types'
import type { HistoryViewState } from './WorkoutHistoryPage'
import { calculatePersonalRecordsByGym, getPersonalRecordGroupKey } from '../features/personalRecords'
import './WorkoutSummaryPage.css'

interface SummaryExercise {
  bodyPartName: string
  exerciseName: string
  sets: WorkoutSet[]
  markedSetIds: Set<number>
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
  const end = endTime ?? startTime
  const minutes = Math.max(0, Math.floor((end.getTime() - startTime.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

async function loadSummary(workoutId: number): Promise<WorkoutSummary | null> {
  await removeEmptyWorkoutExercises(workoutId)
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

  const summaryExercises = (await Promise.all(
    orderedWorkoutExercises.map(async (workoutExercise) => {
      const exercise = exerciseById.get(workoutExercise.exerciseId)
      const sets = await db.workoutSets
        .where('workoutExerciseId')
        .equals(workoutExercise.id!)
        .sortBy('setNumber')
      const allExerciseWorkoutExercises = await db.workoutExercises
        .where('exerciseId')
        .equals(workoutExercise.exerciseId)
        .toArray()
      const allExerciseSets = await db.workoutSets
        .where('workoutExerciseId')
        .anyOf(allExerciseWorkoutExercises.map((entry) => entry.id!))
        .toArray()
      const allExerciseWorkouts = await db.workouts
        .where('id')
        .anyOf(allExerciseWorkoutExercises.map((entry) => entry.workoutId))
        .toArray()
      const workoutById = new Map(allExerciseWorkouts.map((entry) => [entry.id!, entry]))
      const gymIdByWorkoutExerciseId = new Map(
        allExerciseWorkoutExercises.map((entry) => [entry.id!, workoutById.get(entry.workoutId)?.gymId]),
      )
      const recordsByGym = calculatePersonalRecordsByGym(
        allExerciseSets,
        gymIdByWorkoutExerciseId,
        exercise?.machine === true,
      )
      const currentGroupKey = getPersonalRecordGroupKey(workout.gymId, exercise?.machine === true)

      return {
        bodyPartName: exercise ? groupById.get(exercise.bodyPartGroupId)?.name ?? 'Unassigned' : 'Unknown',
        exerciseName: exercise?.name ?? 'Unknown exercise',
        sets,
        markedSetIds: recordsByGym.get(currentGroupKey)?.markedSetIds ?? new Set(),
      }
    }),
  ))
    .filter((exercise) => exercise.sets.length > 0)
    .sort((left, right) => {
      const leftFirstSetTime = Math.min(...left.sets.map((set) => set.timestamp.getTime()))
      const rightFirstSetTime = Math.min(...right.sets.map((set) => set.timestamp.getTime()))
      return leftFirstSetTime - rightFirstSetTime || left.exerciseName.localeCompare(right.exerciseName)
    })

  const firstSetTime = summaryExercises
    .flatMap((exercise) => exercise.sets)
    .reduce<Date | undefined>(
      (earliest, set) => (!earliest || set.timestamp < earliest ? set.timestamp : earliest),
      undefined,
    )
  const correctedWorkout = firstSetTime && workout.startTime.getTime() !== firstSetTime.getTime()
    ? { ...workout, startTime: firstSetTime }
    : workout
  if (correctedWorkout !== workout) {
    await db.workouts.update(workoutId, { startTime: firstSetTime })
  }

  return { workout: correctedWorkout, gym: gym ?? null, exercises: summaryExercises }
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
  const exercisesWithSets = summary.exercises.filter((exercise) => exercise.sets.length > 0)
  const lastSetTime = exercisesWithSets
    .flatMap((exercise) => exercise.sets)
    .reduce<Date | undefined>(
      (latest, set) => (!latest || set.timestamp > latest ? set.timestamp : latest),
      undefined,
    )

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
          <strong>{formatDuration(workout.startTime, lastSetTime ?? workout.endTime)}</strong>
        </div>
      </section>

      <section className="ws-exercises" aria-label="Exercises">
        {exercisesWithSets.length === 0 ? (
          <p className="ws-no-exercises">No exercises logged.</p>
        ) : (
          exercisesWithSets.map((exercise, index) => (
            <article className="ws-exercise" key={`${exercise.exerciseName}-${index}`}>
              <div className="ws-exercise-heading">
                <span className="ws-body-part">{exercise.bodyPartName}</span>
                <h2>{exercise.exerciseName}</h2>
              </div>
              <div className="ws-sets">
                {exercise.sets.map((set) => (
                  <div className="ws-set-row" key={set.id}>
                    <span>{set.weight} kg × {set.reps}{exercise.markedSetIds.has(set.id!) && <span className="pr-star" aria-label="Personal record"> ★</span>}</span>
                    <time dateTime={set.timestamp.toISOString()}>{formatTime(set.timestamp)}</time>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
