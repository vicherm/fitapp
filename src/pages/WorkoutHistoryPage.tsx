import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Workout } from '../db/types'
import './WorkoutHistoryPage.css'

interface WorkoutHistoryItem {
  workout: Workout
  gymAbbreviation: string
  exerciseNames: string[]
}

function formatWorkoutDate(input: Date): string {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonth(input: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(input)
}

export default function WorkoutHistoryPage() {
  const navigate = useNavigate()
  const currentMonth = useRef(new Date())
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([])
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(currentMonth.current.getFullYear(), currentMonth.current.getMonth(), 1),
  )

  useEffect(() => {
    async function loadWorkouts() {
      const allWorkouts = await db.workouts.orderBy('startTime').reverse().toArray()
      const workoutIds = allWorkouts.flatMap((workout) => (workout.id ? [workout.id] : []))
      const workoutExercises = workoutIds.length > 0
        ? await db.workoutExercises.where('workoutId').anyOf(workoutIds).toArray()
        : []
      const exerciseIds = Array.from(new Set(workoutExercises.map((workoutExercise) => workoutExercise.exerciseId)))
      const exercises = exerciseIds.length > 0 ? await db.exercises.where('id').anyOf(exerciseIds).toArray() : []
      const gymIds = Array.from(
        new Set(allWorkouts.flatMap((workout) => (workout.gymId ? [workout.gymId] : []))),
      )
      const gyms = gymIds.length > 0 ? await db.gyms.where('id').anyOf(gymIds).toArray() : []
      const exerciseNameById = new Map(exercises.map((exercise) => [exercise.id!, exercise.name]))
      const gymAbbreviationById = new Map(gyms.map((gym) => [gym.id!, gym.abbreviation]))
      const exercisesByWorkoutId = new Map<number, typeof workoutExercises>()

      for (const workoutExercise of workoutExercises) {
        const current = exercisesByWorkoutId.get(workoutExercise.workoutId) ?? []
        current.push(workoutExercise)
        exercisesByWorkoutId.set(workoutExercise.workoutId, current)
      }

      setWorkouts(allWorkouts.map((workout) => ({
        workout,
        gymAbbreviation: workout.gymId ? (gymAbbreviationById.get(workout.gymId) ?? 'UNKN') : 'UNKN',
        exerciseNames: (exercisesByWorkoutId.get(workout.id!) ?? [])
          .sort((left, right) => left.order - right.order)
          .map((workoutExercise) => exerciseNameById.get(workoutExercise.exerciseId) ?? 'Unknown exercise'),
      })))
      setIsLoading(false)
    }

    void loadWorkouts()
  }, [])

  function handleCalendarPointerDown(event: PointerEvent<HTMLElement>) {
    swipeStart.current = { x: event.clientX, y: event.clientY }
  }

  function handleCalendarPointerUp(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return

    const horizontalDistance = event.clientX - start.x
    const verticalDistance = event.clientY - start.y
    if (Math.abs(horizontalDistance) < 48 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return

    setDisplayedMonth((month) => {
      const direction = horizontalDistance > 0 ? -1 : 1
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + direction, 1)
      const latestMonth = new Date(currentMonth.current.getFullYear(), currentMonth.current.getMonth(), 1)
      return nextMonth > latestMonth ? month : nextMonth
    })
  }

  if (isLoading) {
    return <div className="wh-loading">Loading...</div>
  }

  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate()
  const firstWeekday = (new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay() + 6) % 7
  const workoutDays = new Set(
    workouts
      .filter((item) => (
        item.workout.startTime.getFullYear() === displayedMonth.getFullYear()
        && item.workout.startTime.getMonth() === displayedMonth.getMonth()
      ))
      .map((item) => item.workout.startTime.getDate()),
  )

  return (
    <main className="wh">
      <header className="wh-header">
        <button className="wh-back" onClick={() => navigate('/home')} aria-label="Back to Home">
          ←
        </button>
        <h1>History</h1>
      </header>

      <section
        className="wh-calendar"
        aria-label={`${formatMonth(displayedMonth)} workout calendar`}
        onPointerDown={handleCalendarPointerDown}
        onPointerUp={handleCalendarPointerUp}
        onPointerCancel={() => { swipeStart.current = null }}
      >
        <h2>{formatMonth(displayedMonth)}</h2>
        <div className="wh-calendar-weekdays" aria-hidden="true">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="wh-calendar-days">
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            return <span key={day} className={workoutDays.has(day) ? 'has-workout' : undefined}>{day}</span>
          })}
        </div>
      </section>

      <section className="wh-list" aria-label="Workout history">
        {workouts.length === 0 ? (
          <p className="wh-empty">No workouts recorded yet.</p>
        ) : (
          workouts.map(({ workout, gymAbbreviation, exerciseNames }) => (
            <article key={workout.id} className="wh-workout">
              <h2>{formatWorkoutDate(workout.startTime)} <span>{gymAbbreviation}</span></h2>
              {exerciseNames.length === 0 ? (
                <p className="wh-no-exercises">No exercises logged.</p>
              ) : (
                <ul>
                  {exerciseNames.map((name, index) => <li key={`${workout.id}-${index}`}>{name}</li>)}
                </ul>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  )
}