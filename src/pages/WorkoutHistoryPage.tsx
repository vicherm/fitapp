import { type MouseEvent, type PointerEvent, type TouchEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Workout } from '../db/types'
import './WorkoutHistoryPage.css'

interface WorkoutHistoryItem {
  workout: Workout
  gymAbbreviation: string
  exerciseNames: string[]
}

const WORKOUTS_PER_PAGE = 3

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
  const listSwipeStart = useRef<{ x: number; y: number } | null>(null)
  const suppressWorkoutClick = useRef(false)
  const [isLoading, setIsLoading] = useState(true)
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([])
  const [workoutDates, setWorkoutDates] = useState<Date[]>([])
  const [page, setPage] = useState(0)
  const [workoutCount, setWorkoutCount] = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(currentMonth.current.getFullYear(), currentMonth.current.getMonth(), 1),
  )

  useEffect(() => {
    async function loadWorkoutDates() {
      const allWorkouts = await db.workouts.orderBy('startTime').toArray()
      setWorkoutDates(allWorkouts.map((workout) => workout.startTime))
    }

    void loadWorkoutDates()
  }, [])

  useEffect(() => {
    async function loadWorkouts() {
      setIsLoading(true)
      const nextMonthStart = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1)
      const listEnd = selectedDate
        ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1)
        : nextMonthStart
      const workoutsBeforeDate = db.workouts.where('startTime').below(listEnd)
      const [count, pageWorkouts] = await Promise.all([
        workoutsBeforeDate.count(),
        workoutsBeforeDate.reverse().offset(page * WORKOUTS_PER_PAGE).limit(WORKOUTS_PER_PAGE).toArray(),
      ])
      const workoutIds = pageWorkouts.flatMap((workout) => (workout.id ? [workout.id] : []))
      const workoutExercises = workoutIds.length > 0
        ? await db.workoutExercises.where('workoutId').anyOf(workoutIds).toArray()
        : []
      const exerciseIds = Array.from(new Set(workoutExercises.map((workoutExercise) => workoutExercise.exerciseId)))
      const exercises = exerciseIds.length > 0 ? await db.exercises.where('id').anyOf(exerciseIds).toArray() : []
      const gymIds = Array.from(
        new Set(pageWorkouts.flatMap((workout) => (workout.gymId ? [workout.gymId] : []))),
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

      setWorkouts(pageWorkouts.map((workout) => ({
        workout,
        gymAbbreviation: workout.gymId ? (gymAbbreviationById.get(workout.gymId) ?? 'UNKN') : 'UNKN',
        exerciseNames: (exercisesByWorkoutId.get(workout.id!) ?? [])
          .sort((left, right) => left.order - right.order)
          .map((workoutExercise) => exerciseNameById.get(workoutExercise.exerciseId) ?? 'Unknown exercise'),
      })))
      setWorkoutCount(count)
      setIsLoading(false)
    }

    void loadWorkouts()
  }, [displayedMonth, page, selectedDate])

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
      if (nextMonth > latestMonth) return month
      setPage(0)
      setSelectedDate(null)
      return nextMonth
    })
  }

  function handleDateClick(day: number) {
    setPage(0)
    setSelectedDate(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day))
  }

  function handleListPointerDown(event: PointerEvent<HTMLElement>) {
    // Touch gestures are handled separately below. Keeping the pointer path for
    // mouse/stylus makes desktop testing and accessibility tools work as well.
    if (event.pointerType === 'touch' || event.pointerType === 'mouse') return
    listSwipeStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleListPointerUp(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch' || event.pointerType === 'mouse') return
    const start = listSwipeStart.current
    listSwipeStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!start) return

    handleListSwipe(start.x, start.y, event.clientX, event.clientY)
  }

  function handleListMouseDown(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0) return
    suppressWorkoutClick.current = false
    listSwipeStart.current = { x: event.clientX, y: event.clientY }
  }

  function handleListMouseUp(event: MouseEvent<HTMLElement>) {
    const start = listSwipeStart.current
    listSwipeStart.current = null
    if (!start) return
    handleListSwipe(start.x, start.y, event.clientX, event.clientY)
  }

  function handleListSwipe(startX: number, startY: number, endX: number, endY: number) {
    const horizontalDistance = endX - startX
    const verticalDistance = endY - startY
    if (Math.abs(horizontalDistance) < 48 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return

    suppressWorkoutClick.current = true

    if (horizontalDistance > 0 && page > 0) {
      setPage((current) => current - 1)
    } else if (horizontalDistance < 0 && (page + 1) * WORKOUTS_PER_PAGE < workoutCount) {
      setPage((current) => current + 1)
    }
  }

  function handleListTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0]
    if (touch) {
      suppressWorkoutClick.current = false
      listSwipeStart.current = { x: touch.clientX, y: touch.clientY }
    }
  }

  function handleListTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = listSwipeStart.current
    listSwipeStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    handleListSwipe(start.x, start.y, touch.clientX, touch.clientY)
  }

  if (isLoading) {
    return <div className="wh-loading">Loading...</div>
  }

  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate()
  const firstWeekday = (new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay() + 6) % 7
  const workoutDays = new Set(
    workoutDates
      .filter((workoutDate) => (
        workoutDate.getFullYear() === displayedMonth.getFullYear()
        && workoutDate.getMonth() === displayedMonth.getMonth()
      ))
      .map((workoutDate) => workoutDate.getDate()),
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
            const isSelected = selectedDate?.getDate() === day
            return (
              <button
                key={day}
                className={`${workoutDays.has(day) ? 'has-workout' : ''} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleDateClick(day)}
                aria-label={`Show workouts from ${formatWorkoutDate(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day))}`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </section>

      <section
        className="wh-list"
        aria-label="Workout history"
        onPointerDown={handleListPointerDown}
        onPointerUp={handleListPointerUp}
        onMouseDown={handleListMouseDown}
        onMouseUp={handleListMouseUp}
        onTouchStart={handleListTouchStart}
        onTouchEnd={handleListTouchEnd}
        onPointerCancel={(event) => {
          if (event.pointerType === 'touch') return
          listSwipeStart.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
      >
        {workouts.length === 0 ? (
          <p className="wh-empty">No workouts recorded yet.</p>
        ) : (
          workouts.map(({ workout, gymAbbreviation, exerciseNames }) => (
            <article
              key={workout.id}
              className="wh-workout"
              role="link"
              tabIndex={0}
              onClick={() => {
                if (suppressWorkoutClick.current) {
                  suppressWorkoutClick.current = false
                  return
                }
                if (workout.id) navigate(`/history/${workout.id}`)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                if (workout.id) navigate(`/history/${workout.id}`)
              }}
            >
              <h2>
                <span>
                  {formatWorkoutDate(workout.startTime)}
                </span>
                <span>{gymAbbreviation}</span>
              </h2>
              {exerciseNames.length === 0 ? (
                <p className="wh-no-exercises">No exercises logged.</p>
              ) : (
                <ul>
                  {exerciseNames.map((name, index) => (
                    <li key={`${workout.id}-${index}`}>{name}</li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  )
}
