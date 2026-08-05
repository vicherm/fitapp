import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import type { Exercise, WorkoutExercise, WorkoutSet } from '../../db/types'
import type { WorkoutState } from '../../hooks/useWorkout'
import NumericKeypad from '../ui/NumericKeypad'
import './ActiveWorkout.css'

interface Props {
  workout: WorkoutState
  pendingExercise?: Exercise
}

type Field = 'weight' | 'reps'
const ACTIVE_WORKOUT_DRAFT_KEY = 'gymlog-active-workout-draft-v1'

interface ActiveWorkoutDraft {
  workoutId: number
  exerciseId?: number
  weight: string
  reps: string
  activeField: Field
}

function formatWorkoutDate(input: Date): string {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ActiveWorkout({ workout, pendingExercise }: Props) {
  const navigate = useNavigate()
  const { workout: w, isLoading, startWorkout } = workout

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [workoutExercise, setWorkoutExercise] = useState<WorkoutExercise | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [activeField, setActiveField] = useState<Field>('weight')
  const [currentSets, setCurrentSets] = useState<WorkoutSet[]>([])
  const [previousWorkoutSets, setPreviousWorkoutSets] = useState<WorkoutSet[][]>([[], []])
  const [previousWorkoutTitles, setPreviousWorkoutTitles] = useState<string[]>(['Previous', 'Previous'])
  const isHydratingDraftRef = useRef(false)
  const skipNextPrefillRef = useRef(false)

  // Apply selected exercise passed from the exercise picker.
  useEffect(() => {
    if (pendingExercise) {
      void handleSelectExercise(pendingExercise)
    }
  }, [pendingExercise, w?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore in-progress state when returning to Active page.
  useEffect(() => {
    if (isLoading) return

    if (!w?.id) {
      sessionStorage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY)
      return
    }

    // Explicit navigation selection has priority over restored draft.
    if (pendingExercise?.id) return

    const raw = sessionStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY)
    if (!raw) return

    try {
      const draft = JSON.parse(raw) as Partial<ActiveWorkoutDraft>
      if (draft.workoutId !== w.id) return

      isHydratingDraftRef.current = true
      skipNextPrefillRef.current = true

      setWeight(typeof draft.weight === 'string' ? draft.weight : '')
      setReps(typeof draft.reps === 'string' ? draft.reps : '')
      setActiveField(draft.activeField === 'reps' ? 'reps' : 'weight')

      if (typeof draft.exerciseId === 'number') {
        db.exercises
          .get(draft.exerciseId)
          .then(async (savedExercise) => {
            if (savedExercise) {
              await handleSelectExercise(savedExercise)
            }
          })
          .finally(() => {
            isHydratingDraftRef.current = false
          })
        return
      }

      isHydratingDraftRef.current = false
    } catch {
      isHydratingDraftRef.current = false
    }
  }, [isLoading, w?.id, pendingExercise?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist in-progress state so it survives page navigation.
  useEffect(() => {
    if (!w?.id || isHydratingDraftRef.current) return

    const draft: ActiveWorkoutDraft = {
      workoutId: w.id,
      exerciseId: exercise?.id,
      weight,
      reps,
      activeField,
    }
    sessionStorage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify(draft))
  }, [w?.id, exercise?.id, weight, reps, activeField])

  // Load history whenever exercise or workout changes
  useEffect(() => {
    if (!exercise?.id || !w?.id) {
      setCurrentSets([])
      setPreviousWorkoutSets([[], []])
      setPreviousWorkoutTitles(['Previous', 'Previous'])
      return
    }

    async function loadHistory() {
      const weList = await db.workoutExercises
        .where('exerciseId')
        .equals(exercise!.id!)
        .toArray()

      const weIds = weList.map((we) => we.id!)
      const allSets = await db.workoutSets.where('workoutExerciseId').anyOf(weIds).toArray()

      const currentWeIds = new Set(
        weList.filter((we) => we.workoutId === w!.id).map((we) => we.id!),
      )
      setCurrentSets(
        allSets
          .filter((s) => currentWeIds.has(s.workoutExerciseId))
          .sort((a, b) => a.setNumber - b.setNumber),
      )

      // Load up to two previous workouts for this exercise
      const priorWorkoutIds = Array.from(
        new Set(
          weList
            .filter((we) => we.workoutId !== w!.id)
            .sort((a, b) => b.workoutId - a.workoutId)
            .map((we) => we.workoutId),
        ),
      ).slice(0, 2)

      const priorWorkouts =
        priorWorkoutIds.length > 0
          ? await db.workouts.where('id').anyOf(priorWorkoutIds).toArray()
          : []
      const priorWorkoutById = new Map(priorWorkouts.map((workout) => [workout.id!, workout]))

      const previousColumns = priorWorkoutIds.map((workoutId) => {
        const workoutExerciseIds = weList
          .filter((we) => we.workoutId === workoutId)
          .map((we) => we.id!)

        return allSets
          .filter((s) => workoutExerciseIds.includes(s.workoutExerciseId))
          .sort((a, b) => a.setNumber - b.setNumber)
      })
      setPreviousWorkoutSets([previousColumns[0] ?? [], previousColumns[1] ?? []])
      setPreviousWorkoutTitles([
        priorWorkoutById.get(priorWorkoutIds[0])
          ? formatWorkoutDate(priorWorkoutById.get(priorWorkoutIds[0])!.startTime)
          : 'Previous',
        priorWorkoutById.get(priorWorkoutIds[1])
          ? formatWorkoutDate(priorWorkoutById.get(priorWorkoutIds[1])!.startTime)
          : 'Previous',
      ])

      // Avoid overriding restored draft values once after hydration.
      if (skipNextPrefillRef.current) {
        skipNextPrefillRef.current = false
      } else {
        // Pre-fill from last set of this exercise.
        const lastSet = [...allSets]
          .filter((s) => currentWeIds.has(s.workoutExerciseId))
          .sort((a, b) => b.setNumber - a.setNumber)[0]
        if (lastSet) {
          setWeight(String(lastSet.weight))
          setReps(String(lastSet.reps))
        } else if (priorWorkoutIds[0]) {
          const latestPriorWorkoutExerciseIds = weList
            .filter((we) => we.workoutId === priorWorkoutIds[0])
            .map((we) => we.id!)
          const lastPrev = allSets
            .filter((s) => latestPriorWorkoutExerciseIds.includes(s.workoutExerciseId))
            .sort((a, b) => b.setNumber - a.setNumber)[0]
          if (lastPrev) {
            setWeight(String(lastPrev.weight))
            setReps(String(lastPrev.reps))
          }
        }
      }
    }

    loadHistory()
  }, [exercise, w])

  async function handleSelectExercise(ex: Exercise) {
    setExercise(ex)
    if (!w?.id) {
      setWorkoutExercise(null)
      return
    }

    // Get or create the WorkoutExercise for this exercise in the current workout
    let we = (
      await db.workoutExercises
        .where('workoutId')
        .equals(w.id)
        .and((r) => r.exerciseId === ex.id!)
        .first()
    )
    if (!we) {
      const count = await db.workoutExercises.where('workoutId').equals(w.id).count()
      const id = await db.workoutExercises.add({
        workoutId: w.id,
        exerciseId: ex.id!,
        order: count,
      })
      we = await db.workoutExercises.get(id)
    }
    setWorkoutExercise(we ?? null)
  }

  async function logSet() {
    const wNum = parseFloat(weight)
    const rNum = parseInt(reps, 10)
    if (!workoutExercise?.id || isNaN(wNum) || isNaN(rNum)) return

    const setNumber = currentSets.length + 1
    const id = await db.workoutSets.add({
      workoutExerciseId: workoutExercise.id,
      setNumber,
      weight: wNum,
      reps: rNum,
      timestamp: new Date(),
    })
    const saved = await db.workoutSets.get(id)
    if (saved) setCurrentSets((prev) => [...prev, saved])
  }

  function handleInputKey(key: string) {
    if (key === '') return
    const setter = activeField === 'weight' ? setWeight : setReps
    setter((prev) => {
      if (key === '⌫') return prev.slice(0, -1)
      if (key === '.' && prev.includes('.')) return prev
      if (key === '.' && activeField === 'reps') return prev
      return prev + key
    })
  }

  function handleKeypad(key: string) {
    handleInputKey(key)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        handleInputKey(event.key)
        return
      }

      if ((event.key === '.' || event.key === ',') && activeField === 'weight') {
        event.preventDefault()
        handleInputKey('.')
        return
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        handleInputKey('⌫')
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        void logSet()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeField, exercise, workoutExercise, weight, reps, currentSets.length, w])

  function selectField(field: Field) {
    setActiveField(field)
    if (field === 'weight') {
      setWeight('')
      return
    }
    setReps('')
  }

  if (isLoading) return <div className="aw-loading">Loading…</div>

  if (!w) {
    return (
      <div className="aw-start">
        <div className="aw-start-content">
          <Link className="aw-home-link" to="/home">
            Home
          </Link>
          <button className="aw-start-btn" onClick={startWorkout}>
            Start Workout
          </button>
        </div>
      </div>
    )
  }

  const historyColumns = [
    { title: 'Current', sets: currentSets },
    { title: previousWorkoutTitles[0], sets: previousWorkoutSets[0] ?? [] },
    { title: previousWorkoutTitles[1], sets: previousWorkoutSets[1] ?? [] },
  ]

  return (
    <div className="aw">
      <div className="aw-top-row">
        {exercise?.id && (
          <Link
            className="aw-history-link"
            to={`/exercises/${exercise.id}/history`}
          >
            History
          </Link>
        )}
        <Link className="aw-home-link" to="/home">
          Home
        </Link>
      </div>

      {/* Exercise selector */}
      <button
        className="aw-exercise-btn"
        onClick={() => navigate('/exercises')}
      >
        {exercise ? exercise.name : 'Select Exercise'}
      </button>

      {/* Weight / reps row */}
      <div className="aw-inputs">
        <button
          className={`aw-field ${activeField === 'weight' ? 'active' : ''}`}
          onClick={() => selectField('weight')}
          onFocus={() => selectField('weight')}
        >
          <span className="aw-field-label">kg</span>
          <span className="aw-field-value">{weight || '0'}</span>
        </button>
        <button
          className={`aw-field ${activeField === 'reps' ? 'active' : ''}`}
          onClick={() => selectField('reps')}
          onFocus={() => selectField('reps')}
        >
          <span className="aw-field-label">reps</span>
          <span className="aw-field-value">{reps || '0'}</span>
        </button>

        <button
          className="aw-log-btn"
          onClick={logSet}
          disabled={!exercise || !workoutExercise || !w}
        >
          LOG
        </button>
      </div>

      {/* Numeric keypad */}
      <NumericKeypad onKey={handleKeypad} showDecimal={activeField === 'weight'} />

      {/* History */}
      <div className="aw-history">
        {historyColumns.map((column, index) => (
          <section key={`${index}-${column.title}`}>
            <h3>{column.title}</h3>
            {column.sets.length > 0 ? (
              column.sets.map((s) => (
                <p key={s.id}>
                  {s.weight} × {s.reps}
                </p>
              ))
            ) : (
              <p className="aw-history-empty">No sets</p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
