import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Gym } from '../db/types'
import './StatisticsPage.css'

interface GymStatistic {
  gym: Gym
  workoutCount: number
}

interface Statistics {
  workoutCount: number
  averageWorkoutsPerWeek: number
  averageDurationMinutes: number
  topGyms: GymStatistic[]
}

function startOfWeek(input: Date): Date {
  const date = new Date(input.getFullYear(), input.getMonth(), input.getDate())
  const day = date.getDay()
  const daysSinceMonday = (day + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)
  return date
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`
}

function formatAverageDuration(minutes: number): string {
  return formatDuration(Math.round(minutes))
}

async function loadStatistics(): Promise<Statistics> {
  const [workouts, gyms, workoutExercises, workoutSets] = await Promise.all([
    db.workouts.toArray(),
    db.gyms.toArray(),
    db.workoutExercises.toArray(),
    db.workoutSets.toArray(),
  ])

  if (workouts.length === 0) {
    return {
      workoutCount: 0,
      averageWorkoutsPerWeek: 0,
      averageDurationMinutes: 0,
      topGyms: [],
    }
  }

  const setsByWorkoutId = new Map<number, Date[]>()
  const workoutByExerciseId = new Map<number, number>()
  for (const workoutExercise of workoutExercises) {
    workoutByExerciseId.set(workoutExercise.id!, workoutExercise.workoutId)
  }
  for (const workoutSet of workoutSets) {
    const workoutId = workoutByExerciseId.get(workoutSet.workoutExerciseId)
    if (workoutId === undefined) continue
    const timestamps = setsByWorkoutId.get(workoutId) ?? []
    timestamps.push(workoutSet.timestamp)
    setsByWorkoutId.set(workoutId, timestamps)
  }

  const sortedWorkouts = [...workouts].sort((left, right) => left.startTime.getTime() - right.startTime.getTime())
  const firstWeek = startOfWeek(sortedWorkouts[0].startTime)
  const lastWeek = startOfWeek(sortedWorkouts[sortedWorkouts.length - 1].startTime)
  const weekCount = Math.max(1, Math.floor((lastWeek.getTime() - firstWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)

  let totalDurationMinutes = 0
  for (const workout of workouts) {
    const setTimes = setsByWorkoutId.get(workout.id!) ?? []
    const latestSetTime = setTimes.reduce<Date | undefined>(
      (latest, timestamp) => (!latest || timestamp > latest ? timestamp : latest),
      undefined,
    )
    const endTime = latestSetTime ?? workout.endTime
    if (endTime) {
      totalDurationMinutes += Math.max(0, Math.floor((endTime.getTime() - workout.startTime.getTime()) / 60000))
    }
  }

  const gymById = new Map(gyms.map((gym) => [gym.id!, gym]))
  const workoutCountByGymId = new Map<number, number>()
  for (const workout of workouts) {
    if (workout.gymId === undefined) continue
    workoutCountByGymId.set(workout.gymId, (workoutCountByGymId.get(workout.gymId) ?? 0) + 1)
  }

  const topGyms = Array.from(workoutCountByGymId.entries())
    .map(([gymId, workoutCount]) => ({ gym: gymById.get(gymId), workoutCount }))
    .filter((entry): entry is GymStatistic => entry.gym !== undefined)
    .sort((left, right) => right.workoutCount - left.workoutCount || left.gym.name.localeCompare(right.gym.name))
    .slice(0, 4)

  return {
    workoutCount: workouts.length,
    averageWorkoutsPerWeek: workouts.length / weekCount,
    averageDurationMinutes: totalDurationMinutes / workouts.length,
    topGyms,
  }
}

export default function StatisticsPage() {
  const [statistics, setStatistics] = useState<Statistics | null>(null)

  useEffect(() => {
    void loadStatistics().then(setStatistics)
  }, [])

  if (!statistics) return <main className="statistics-page">Loading...</main>

  return (
    <main className="statistics-page">
      <header className="statistics-header">
        <Link className="statistics-back" to="/home" aria-label="Back to Home">
          ←
        </Link>
        <h1>Statistics</h1>
      </header>

      <section className="statistics-metrics" aria-label="Workout statistics">
        <article className="statistics-metric">
          <span>Average workouts / week</span>
          <strong>{statistics.averageWorkoutsPerWeek.toFixed(1)}</strong>
        </article>
        <article className="statistics-metric">
          <span>Total workouts</span>
          <strong>{statistics.workoutCount}</strong>
        </article>
        <article className="statistics-metric">
          <span>Average workout duration</span>
          <strong>{formatAverageDuration(statistics.averageDurationMinutes)}</strong>
        </article>
      </section>

      <section className="statistics-gyms" aria-labelledby="statistics-gyms-title">
        <h2 id="statistics-gyms-title">Top gyms</h2>
        {statistics.topGyms.length === 0 ? (
          <p className="statistics-empty">No gym data recorded yet.</p>
        ) : (
          <ol className="statistics-gym-list">
            {statistics.topGyms.map(({ gym, workoutCount }) => (
              <li className="statistics-gym" key={gym.id}>
                <span className="statistics-gym-name">
                  <strong>{gym.abbreviation}</strong>
                  {gym.name}
                </span>
                <span className="statistics-gym-share">
                  {Math.round((workoutCount / statistics.workoutCount) * 100)}%
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
