import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { BodyPartGroup, Exercise, Gym, Workout, WorkoutSet } from '../db/types'
import { listBodyPartGroups } from '../data/bodyPartGroups'
import { listExercises } from '../data/exercises'
import { getGym, listGyms } from '../data/gyms'
import { uploadWorkoutToStrava } from '../data/strava'
import {
  listWorkoutExercises,
  listWorkoutSets,
  listWorkouts,
  getWorkout,
  updateWorkout,
} from '../data/workouts'
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
  gyms: Gym[]
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
  const workout = await getWorkout(workoutId)
  if (!workout) return null

  const [gym, gyms, workoutExercises] = await Promise.all([
    workout.gymId ? getGym(workout.gymId) : Promise.resolve(null),
    listGyms(),
    listWorkoutExercises([workoutId]),
  ])
  const orderedWorkoutExercises = workoutExercises.sort((left, right) => left.order - right.order)
  const exerciseIds = orderedWorkoutExercises.map((workoutExercise) => workoutExercise.exerciseId)
  const exercises = exerciseIds.length > 0
    ? (await listExercises()).filter((exercise) => exerciseIds.includes(exercise.id!))
    : []
  const groupIds = Array.from(new Set(exercises.map((exercise) => exercise.bodyPartGroupId)))
  const groups = groupIds.length > 0
    ? (await listBodyPartGroups()).filter((group) => groupIds.includes(group.id!))
    : []
  const exerciseById = new Map<number, Exercise>(exercises.map((exercise) => [exercise.id!, exercise]))
  const groupById = new Map<number, BodyPartGroup>(groups.map((group) => [group.id!, group]))

  const summaryExercises = (await Promise.all(
    orderedWorkoutExercises.map(async (workoutExercise) => {
      const exercise = exerciseById.get(workoutExercise.exerciseId)
      const sets = (await listWorkoutSets([workoutExercise.id!])).sort((left, right) => left.setNumber - right.setNumber)
      const allExerciseWorkoutExercises = (await listWorkoutExercises())
        .filter((entry) => entry.exerciseId === workoutExercise.exerciseId)
      const allExerciseSets = await listWorkoutSets(allExerciseWorkoutExercises.map((entry) => entry.id!))
      const allExerciseWorkouts = (await listWorkouts())
        .filter((entry) => allExerciseWorkoutExercises.some((workoutEntry) => workoutEntry.workoutId === entry.id))
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
    await updateWorkout(workoutId, { startTime: firstSetTime })
  }

  return { workout: correctedWorkout, gym: gym ?? null, gyms, exercises: summaryExercises }
}

export default function WorkoutSummaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const summaryState = location.state as { historyView?: HistoryViewState; returnToActiveWorkout?: boolean } | null
  const historyView = summaryState?.historyView
  const returnToActiveWorkout = summaryState?.returnToActiveWorkout === true
  const { id } = useParams<{ id: string }>()
  const workoutId = Number(id)
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingGym, setIsSavingGym] = useState(false)
  const [isEditingGym, setIsEditingGym] = useState(false)
  const [isUploadingToStrava, setIsUploadingToStrava] = useState(false)
  const [stravaUploadMessage, setStravaUploadMessage] = useState('')

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

  async function handleGymChange(gymId: string) {
    if (!summary || !workoutId || isSavingGym) return

    const nextGymId = gymId ? Number.parseInt(gymId, 10) : undefined
    if (nextGymId !== undefined && !summary.gyms.some((gym) => gym.id === nextGymId)) return

    setIsSavingGym(true)
    await updateWorkout(workoutId, { gymId: nextGymId })
    const nextSummary = await loadSummary(workoutId)
    setSummary(nextSummary)
    setIsEditingGym(false)
    setIsSavingGym(false)
  }

  async function handleStravaUpload() {
    if (!summary || !workoutId || isUploadingToStrava) return

    setIsUploadingToStrava(true)
    setStravaUploadMessage('Uploading to Strava...')
    try {
      const result = await uploadWorkoutToStrava(workoutId)
      setStravaUploadMessage(result.alreadyUploaded ? 'Already uploaded to Strava.' : 'Uploaded to Strava.')
    } catch (error) {
      setStravaUploadMessage(error instanceof Error ? error.message : 'Strava upload failed.')
    } finally {
      setIsUploadingToStrava(false)
    }
  }

  if (isLoading) return <div className="ws-loading">Loading...</div>

  if (!summary) {
    return (
      <main className="ws ws-empty-page">
        <button
          className="ws-back"
          onClick={() => navigate(returnToActiveWorkout ? '/' : '/history', { state: { historyView } })}
          aria-label={returnToActiveWorkout ? 'Back to Active Workout' : 'Back to History'}
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
          onClick={() => navigate(returnToActiveWorkout ? '/' : '/history', { state: { historyView } })}
          aria-label={returnToActiveWorkout ? 'Back to Active Workout' : 'Back to History'}
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
          {isEditingGym ? (
            <select
              id="ws-gym-select"
              className="ws-gym-select"
              value={workout.gymId ?? ''}
              onChange={(event) => void handleGymChange(event.target.value)}
              disabled={isSavingGym}
              autoFocus
            >
              <option value="">No gym</option>
              {summary.gyms.map((gym) => (
                <option key={gym.id} value={gym.id}>
                  {gym.abbreviation} {gym.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              className="ws-gym-value"
              onClick={() => setIsEditingGym(true)}
              disabled={isSavingGym}
              aria-label="Change gym"
            >
              {summary.gym?.name ?? 'No gym'}
            </button>
          )}
        </div>
        <div>
          <span>Start</span>
          <strong>{formatTime(workout.startTime)}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{formatDuration(workout.startTime, lastSetTime ?? workout.endTime)}</strong>
        </div>
        <div className="ws-strava-action">
          <button
            type="button"
            className="ws-strava-upload"
            onClick={() => void handleStravaUpload()}
            disabled={isUploadingToStrava || exercisesWithSets.length === 0}
          >
            {isUploadingToStrava ? 'Uploading...' : 'Upload to Strava'}
          </button>
          {stravaUploadMessage && <span className="ws-strava-message" role="status">{stravaUploadMessage}</span>}
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
