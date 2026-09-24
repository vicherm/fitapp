import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BodyPartGroup, Exercise } from '../../db/types'
import { listBodyPartGroups } from '../../data/bodyPartGroups'
import { getExercise, listExercises } from '../../data/exercises'
import { listWorkoutExercises, listWorkouts } from '../../data/workouts'
import './ExerciseSelector.css'

interface ExerciseGroup {
  bodyPartGroup: BodyPartGroup
  exercises: Exercise[]
}

interface Props {
  workoutId?: number
  currentExerciseId?: number
  correction?: {
    sourceExerciseId: number
    workoutId: number
    setId: number
  }
}

const HOT_PICK_RECENT_COUNT = 3
const HOT_PICK_FOLLOWUP_COUNT = 2
const FOLLOWUP_LOOKBACK_MONTHS = 6

async function computeHotPicks(workoutId?: number, currentExerciseId?: number): Promise<Exercise[]> {
  const usedIds = new Set<number>()
  if (currentExerciseId) usedIds.add(currentExerciseId)
  const picks: Exercise[] = []

  // Most recently added exercises within the current workout (for supersets).
  if (workoutId) {
    const workoutExercises = (await listWorkoutExercises([workoutId])).sort((left, right) => left.order - right.order)
    const recentIds: number[] = []
    for (let i = workoutExercises.length - 1; i >= 0 && recentIds.length < HOT_PICK_RECENT_COUNT; i--) {
      const exerciseId = workoutExercises[i].exerciseId
      if (usedIds.has(exerciseId) || recentIds.includes(exerciseId)) continue
      recentIds.push(exerciseId)
    }
    for (const id of recentIds) {
      const ex = await getExercise(id)
      if (ex) {
        picks.push(ex)
        usedIds.add(id)
      }
    }
  }

  // Exercises that most often followed the current exercise in past workouts.
  if (currentExerciseId) {
    const since = new Date()
    since.setMonth(since.getMonth() - FOLLOWUP_LOOKBACK_MONTHS)
    const recentWorkouts = (await listWorkouts()).filter((workout) => workout.startTime >= since)

    const followCounts = new Map<number, number>()
    for (const recentWorkout of recentWorkouts) {
      if (!recentWorkout.id) continue
      const sequence = (await listWorkoutExercises([recentWorkout.id!])).sort((left, right) => left.order - right.order)
      for (let i = 0; i < sequence.length - 1; i++) {
        if (sequence[i].exerciseId !== currentExerciseId) continue
        const nextId = sequence[i + 1].exerciseId
        if (nextId === currentExerciseId) continue
        followCounts.set(nextId, (followCounts.get(nextId) ?? 0) + 1)
      }
    }

    const followIds = Array.from(followCounts.entries())
      .filter(([id]) => !usedIds.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, HOT_PICK_FOLLOWUP_COUNT)
      .map(([id]) => id)

    for (const id of followIds) {
      const ex = await getExercise(id)
      if (ex) {
        picks.push(ex)
        usedIds.add(id)
      }
    }
  }

  return picks
}

export default function ExerciseSelector({ workoutId, currentExerciseId, correction }: Props) {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [bodyPartGroups, setBodyPartGroups] = useState<BodyPartGroup[]>([])
  const [query, setQuery] = useState('')
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(new Set())
  const [hotPicks, setHotPicks] = useState<Exercise[]>([])

  useEffect(() => {
    void Promise.all([
      listExercises(),
      listBodyPartGroups(),
    ]).then(([nextExercises, nextBodyPartGroups]) => {
      setExercises(nextExercises)
      setBodyPartGroups(nextBodyPartGroups)
    })
  }, [])

  useEffect(() => {
    void computeHotPicks(workoutId, currentExerciseId).then(setHotPicks)
  }, [workoutId, currentExerciseId])

  const filtered = query
    ? exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : exercises

  const groupedExercises = bodyPartGroups
    .map<ExerciseGroup | null>((bodyPartGroup) => {
      const nextExercises = filtered
        .filter((exercise) => exercise.bodyPartGroupId === bodyPartGroup.id)
        .sort((a, b) => a.name.localeCompare(b.name))

      if (nextExercises.length === 0) return null

      return {
        bodyPartGroup,
        exercises: nextExercises,
      }
    })
    .filter((group): group is ExerciseGroup => Boolean(group))
    .sort((a, b) => a.bodyPartGroup.name.localeCompare(b.bodyPartGroup.name))

  function toggleGroup(groupId: number) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function selectExercise(exercise: Exercise) {
    if (correction) {
      navigate(`/exercises/${correction.sourceExerciseId}`, {
        state: { correction: { ...correction, targetExerciseId: exercise.id } },
      })
      return
    }
    navigate('/', { state: { selectedExercise: exercise } })
  }


  return (
    <div className="es">
      <div className="es-header">
        <button className="es-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <input
          className="es-search"
          type="search"
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="es-new" onClick={() => navigate('/exercises/create')}>
          +
        </button>
      </div>

      <div className="es-list">
        {query.length === 0 && hotPicks.length > 0 && (
          <section className="es-hotpicks">
            <ul className="es-hotpicks-list">
              {hotPicks.map((exercise) => (
                <li key={exercise.id}>
                  <button className="es-hotpick-item" onClick={() => selectExercise(exercise)}>
                    {exercise.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {groupedExercises.map((group) => {
          const isExpanded = query.length > 0 || expandedGroupIds.has(group.bodyPartGroup.id!)
          return (
            <section key={group.bodyPartGroup.id} className="es-group">
              <button
                className="es-group-title"
                onClick={() => toggleGroup(group.bodyPartGroup.id!)}
                aria-expanded={isExpanded}
              >
                <span className={`es-group-chevron ${isExpanded ? 'expanded' : ''}`}>›</span>
                {group.bodyPartGroup.name}
              </button>
              {isExpanded && (
                <ul className="es-group-list">
                  {group.exercises.map((exercise) => (
                    <li key={exercise.id}>
                      <button
                        className="es-item"
                        onClick={() => selectExercise(exercise)}
                      >
                        {exercise.name}
                      </button>
                      <button
                        className="es-edit"
                        onClick={() => navigate(`/exercises/${exercise.id}`)}
                        aria-label={`Edit ${exercise.name}`}
                      >
                        ⋯
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        {filtered.length === 0 && (
          <li className="es-empty">No exercises found</li>
        )}
      </div>
    </div>
  )
}
