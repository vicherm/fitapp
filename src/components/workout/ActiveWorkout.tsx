import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Exercise, Gym, WorkoutExercise, WorkoutSet } from '../../db/types'
import { getSettings } from '../../data/settings'
import { getExercise } from '../../data/exercises'
import { getGym, listGyms } from '../../data/gyms'
import {
  createWorkoutExercise,
  createWorkoutSet,
  getWorkoutExercise,
  listWorkoutExercises,
  listWorkoutSets,
  listWorkouts,
  updateWorkout,
} from '../../data/workouts'
import type { WorkoutState } from '../../hooks/useWorkout'
import NumericKeypad from '../ui/NumericKeypad'
import {
  calculatePersonalRecords,
  calculatePersonalRecordsByGym,
  getPersonalRecordGroupKey,
  type PersonalRecords,
} from '../../features/personalRecords'
import './ActiveWorkout.css'

interface Props {
  workout: WorkoutState
  pendingExercise?: Exercise
}

type Field = 'weight' | 'reps'
const ACTIVE_WORKOUT_DRAFT_KEY = 'gymlog-active-workout-draft-v1'
const LOG_SET_COOLDOWN_MS = 5000

interface ActiveWorkoutDraft {
  workoutId: number
  exerciseId?: number
  weight: string
  reps: string
  activeField: Field
}

function advancePrefillPosition(sequence: WorkoutSet[], position: number, weight: number): number | null {
  if (position >= sequence.length) return position
  if (sequence[position].weight === weight) return position + 1

  const matchingIndex = sequence.findIndex((set, index) => index >= position && set.weight === weight)
  return matchingIndex >= 0 ? matchingIndex + 1 : null
}

function formatWorkoutDate(input: Date): string {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function distanceInMetres(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const earthRadius = 6371000
  const latitudeDelta = (latitude2 - latitude1) * Math.PI / 180
  const longitudeDelta = (longitude2 - longitude1) * Math.PI / 180
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1 * Math.PI / 180) * Math.cos(latitude2 * Math.PI / 180)
      * Math.sin(longitudeDelta / 2) ** 2
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ActiveWorkout({ workout, pendingExercise }: Props) {
  const navigate = useNavigate()
  const { workout: w, isLoading, startWorkout, assignGymToWorkout } = workout

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [workoutExercise, setWorkoutExercise] = useState<WorkoutExercise | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [activeField, setActiveField] = useState<Field>('weight')
  const [gyms, setGyms] = useState<Gym[]>([])
  const [selectedGymId, setSelectedGymId] = useState<number | ''>('')
  const [selectedGymAbbreviation, setSelectedGymAbbreviation] = useState('')
  const [isGymPickerOpen, setIsGymPickerOpen] = useState(false)
  const [currentSets, setCurrentSets] = useState<WorkoutSet[]>([])
  const [previousWorkoutSets, setPreviousWorkoutSets] = useState<WorkoutSet[][]>([[], []])
  const [previousWorkoutTitles, setPreviousWorkoutTitles] = useState<string[]>(['Previous', 'Previous'])
  const [personalRecordsByGym, setPersonalRecordsByGym] = useState<Map<string, PersonalRecords>>(
    () => new Map([['all', calculatePersonalRecords([])]]),
  )
  const [personalRecordGroupKeyBySetId, setPersonalRecordGroupKeyBySetId] = useState<Map<number, string>>(new Map())
  const [notification, setNotification] = useState<string | null>(null)
  const [isLogCoolingDown, setIsLogCoolingDown] = useState(false)
  const isHydratingDraftRef = useRef(false)
  const skipNextPrefillRef = useRef(false)
  const previousSequenceRef = useRef<WorkoutSet[]>([])
  const previousSequencePositionRef = useRef(0)
  const logCooldownUntilRef = useRef(0)

  useEffect(() => {
    listGyms().then(setGyms)
  }, [])

  useEffect(() => {
    if (isLoading || w?.id || gyms.length === 0) return

    let isActive = true

    async function prefillGym(previousGymId?: number) {
      const settings = await getSettings()
      const radius = settings?.gymDetectionRadius ?? 200

      const applyPreviousGym = () => {
        if (isActive) setSelectedGymId(previousGymId ?? '')
      }

      if (!navigator.geolocation) {
        applyPreviousGym()
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isActive) return
          const nearestGym = gyms
            .map((gym) => ({
              gym,
              distance: distanceInMetres(
                position.coords.latitude,
                position.coords.longitude,
                gym.latitude,
                gym.longitude,
              ),
            }))
            .filter(({ distance }) => distance <= radius)
            .sort((left, right) => left.distance - right.distance)[0]
          setSelectedGymId(nearestGym?.gym.id ?? previousGymId ?? '')
        },
        applyPreviousGym,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
      )
    }

    listWorkouts()
      .then((workouts) => workouts
        .filter((workout) => typeof workout.gymId === 'number')
        .sort((left, right) => right.startTime.getTime() - left.startTime.getTime())[0])
      .then((previousWorkout) => prefillGym(previousWorkout?.gymId))

    return () => {
      isActive = false
    }
  }, [gyms, isLoading, w?.id])

  useEffect(() => {
    if (!w?.id) {
      setSelectedGymAbbreviation('')
      return
    }

    if (!w.gymId) {
      setSelectedGymAbbreviation('UNKN')
      return
    }

    getGym(w.gymId).then((gym) => {
      setSelectedGymAbbreviation(gym?.abbreviation || 'UNKN')
    })
  }, [w?.id, w?.gymId])

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
        getExercise(draft.exerciseId)
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
      setPersonalRecordsByGym(new Map([['all', calculatePersonalRecords([])]]))
      setPersonalRecordGroupKeyBySetId(new Map())
      setPreviousWorkoutSets([[], []])
      setPreviousWorkoutTitles(['Previous', 'Previous'])
      previousSequenceRef.current = []
      previousSequencePositionRef.current = 0
      return
    }

    async function loadHistory() {
      const weList = (await listWorkoutExercises()).filter((entry) => entry.exerciseId === exercise!.id!)

      const weIds = weList.map((we) => we.id!)
      const allSets = await listWorkoutSets(weIds)
      const allWorkouts = (await listWorkouts()).filter((workout) => weList.some((entry) => entry.workoutId === workout.id))
      const workoutById = new Map(allWorkouts.map((workout) => [workout.id!, workout]))
      const gymIdByWorkoutExerciseId = new Map(
        weList.map((entry) => [entry.id!, workoutById.get(entry.workoutId)?.gymId]),
      )
      const separateByGym = exercise?.machine === true
      setPersonalRecordsByGym(calculatePersonalRecordsByGym(allSets, gymIdByWorkoutExerciseId, separateByGym))
      setPersonalRecordGroupKeyBySetId(
        new Map(allSets.map((set) => [
          set.id!,
          getPersonalRecordGroupKey(gymIdByWorkoutExerciseId.get(set.workoutExerciseId), separateByGym),
        ])),
      )

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
          ? (await listWorkouts()).filter((workout) => priorWorkoutIds.includes(workout.id!))
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

      const previousSequence = previousColumns[0] ?? []
      let previousSequencePosition = 0
      let sequenceMatchingStopped = false
      const currentWorkoutSets = allSets
        .filter((s) => currentWeIds.has(s.workoutExerciseId))
        .sort((a, b) => a.setNumber - b.setNumber)
      for (const currentSet of currentWorkoutSets) {
        const nextPosition = advancePrefillPosition(
          previousSequence,
          previousSequencePosition,
          currentSet.weight,
        )
        if (nextPosition === null) {
          sequenceMatchingStopped = true
          break
        }
        previousSequencePosition = nextPosition
      }
      previousSequenceRef.current = sequenceMatchingStopped ? [] : previousSequence
      previousSequencePositionRef.current = sequenceMatchingStopped ? 0 : previousSequencePosition

      // Avoid overriding restored draft values once after hydration.
      if (skipNextPrefillRef.current) {
        skipNextPrefillRef.current = false
      } else {
        const suggestedSet = previousSequence[previousSequencePosition]
        if (suggestedSet) {
          setWeight(String(suggestedSet.weight))
          setReps(String(suggestedSet.reps))
        } else if (currentWorkoutSets.length > 0) {
          const lastCurrentSet = currentWorkoutSets[currentWorkoutSets.length - 1]
          setWeight(String(lastCurrentSet.weight))
          setReps(String(lastCurrentSet.reps))
        } else {
          setWeight('')
          setReps('')
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

    const workoutExercise = await getWorkoutExercise(w.id, ex.id!)
    setWorkoutExercise(workoutExercise ?? null)
  }

  async function logSet() {
    if (Date.now() < logCooldownUntilRef.current) return

    const wNum = parseFloat(weight)
    const rNum = parseInt(reps, 10)
    if (!exercise?.id || !w?.id || isNaN(wNum) || isNaN(rNum)) return

    const personalRecordGroupKey = getPersonalRecordGroupKey(w.gymId, exercise.machine === true)
    const currentMaximumWeight = personalRecordsByGym.get(personalRecordGroupKey)?.maximumWeight?.weight
    const warningReasons = [
      currentMaximumWeight !== undefined && wNum > currentMaximumWeight * 1.5
        ? `Weight is more than 50% above the current PR of ${currentMaximumWeight} kg.`
        : null,
      rNum > 15 ? 'Repetitions are higher than 15.' : null,
    ].filter((reason): reason is string => reason !== null)

    if (
      warningReasons.length > 0
      && !window.confirm(`Log ${wNum} kg × ${rNum}?\n\n${warningReasons.join('\n')}`)
    ) return

    logCooldownUntilRef.current = Date.now() + LOG_SET_COOLDOWN_MS
    setIsLogCoolingDown(true)
    window.setTimeout(() => {
      logCooldownUntilRef.current = 0
      setIsLogCoolingDown(false)
    }, LOG_SET_COOLDOWN_MS)

    let activeWorkoutExercise = workoutExercise
    if (!activeWorkoutExercise?.id) {
      const existingWorkoutExercise = await getWorkoutExercise(w.id, exercise.id)
      if (existingWorkoutExercise) {
        activeWorkoutExercise = existingWorkoutExercise
      } else {
        const order = (await listWorkoutExercises([w.id])).length
        activeWorkoutExercise = await createWorkoutExercise({
          workoutId: w.id,
          exerciseId: exercise.id,
          order,
        })
      }
      setWorkoutExercise(activeWorkoutExercise ?? null)
    }
    if (!activeWorkoutExercise?.id) return

    const loggedAt = new Date()
    const workoutExercises = await listWorkoutExercises([w.id])
    const workoutExerciseIds = workoutExercises.map((entry) => entry.id!)
    const hasLoggedSet = workoutExerciseIds.length > 0
      && (await listWorkoutSets(workoutExerciseIds)).length > 0
    const setNumber = currentSets.length + 1
    const saved = await createWorkoutSet({
      workoutExerciseId: activeWorkoutExercise.id,
      setNumber,
      weight: wNum,
      reps: rNum,
      timestamp: loggedAt,
    })
    if (!hasLoggedSet) await updateWorkout(w.id, { startTime: loggedAt })
    if (saved) {
      setCurrentSets((prev) => [...prev, saved])

      const exerciseWorkoutExercises = (await listWorkoutExercises()).filter((entry) => entry.exerciseId === exercise!.id!)
      const exerciseSets = await listWorkoutSets(exerciseWorkoutExercises.map((entry) => entry.id!))
      const exerciseWorkouts = (await listWorkouts()).filter((workout) => exerciseWorkoutExercises.some((entry) => entry.workoutId === workout.id))
      const workoutById = new Map(exerciseWorkouts.map((workout) => [workout.id!, workout]))
      const gymIdByWorkoutExerciseId = new Map(
        exerciseWorkoutExercises.map((entry) => [entry.id!, workoutById.get(entry.workoutId)?.gymId]),
      )
      const separateByGym = exercise!.machine === true
      const nextRecordsByGym = calculatePersonalRecordsByGym(exerciseSets, gymIdByWorkoutExerciseId, separateByGym)
      setPersonalRecordsByGym(nextRecordsByGym)
      setPersonalRecordGroupKeyBySetId(new Map(exerciseSets.map((set) => [
        set.id!,
        getPersonalRecordGroupKey(gymIdByWorkoutExerciseId.get(set.workoutExerciseId), separateByGym),
      ])))
      const eventGroupKey = getPersonalRecordGroupKey(gymIdByWorkoutExerciseId.get(saved.workoutExerciseId), separateByGym)
      const event = nextRecordsByGym.get(eventGroupKey)?.events.get(saved.id!)
      if (event && (event.maximumWeight || event.repetitions.length > 0)) {
        const labels = [
          event.maximumWeight ? 'Maximum Weight' : null,
          event.repetitions.length > 0 ? formatRepetitionRecords(event.repetitions) : null,
        ].filter((label): label is string => label !== null)
        setNotification(`New PR: ${labels.join(' + ')} — ${saved.weight} kg`)
      }

      const sequence = previousSequenceRef.current
      const nextPosition = advancePrefillPosition(
        sequence,
        previousSequencePositionRef.current,
        wNum,
      )

      if (nextPosition === null) {
        previousSequenceRef.current = []
        previousSequencePositionRef.current = 0
        setWeight(String(wNum))
        setReps(String(rNum))
        return
      }

      previousSequencePositionRef.current = nextPosition
      const nextSuggestedSet = sequence[nextPosition]

      if (nextSuggestedSet) {
        setWeight(String(nextSuggestedSet.weight))
        setReps(String(nextSuggestedSet.reps))
      } else {
        setWeight(String(wNum))
        setReps(String(rNum))
      }
    }
  }

  function formatRepetitionRecords(repetitions: number[]): string {
    if (repetitions.length === 1) return `${repetitions[0]} rep`
    const sorted = [...repetitions].sort((left, right) => left - right)
    const isContiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1)
    return isContiguous ? `${sorted[0]}–${sorted[sorted.length - 1]} reps` : `${sorted.join(', ')} reps`
  }

  useEffect(() => {
    if (!notification) return
    const timeout = window.setTimeout(() => setNotification(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [notification])

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

  function adjustReps(amount: number) {
    setActiveField('reps')
    setReps((previousReps) => {
      const value = Number.parseInt(previousReps, 10)
      return Number.isNaN(value) ? previousReps : String(Math.max(0, value + amount))
    })
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

  function handleGymChange(gymId: number) {
    if (!w?.id || gymId === w.gymId) {
      setIsGymPickerOpen(false)
      return
    }

    void assignGymToWorkout(w.id, gymId).then(() => {
      setIsGymPickerOpen(false)
    })
  }

  if (isLoading) return <div className="aw-loading">Loading…</div>

  if (!w) {
    const canStart = typeof selectedGymId === 'number'

    return (
      <div className="aw-start">
        <div className="aw-start-content">
          <Link className="aw-home-link" to="/home">
            Home
          </Link>
          {gyms.length > 0 ? (
            <>
              <label className="aw-start-label" htmlFor="aw-gym-select">
                Select Gym
              </label>
              <select
                id="aw-gym-select"
                className="aw-start-select"
                value={selectedGymId}
                onChange={(e) =>
                  setSelectedGymId(e.target.value ? Number.parseInt(e.target.value, 10) : '')
                }
              >
                <option value="">Choose gym…</option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.abbreviation} {gym.name}
                  </option>
                ))}
              </select>
              <button
                className="aw-start-btn"
                onClick={() => {
                  if (typeof selectedGymId === 'number') {
                    void startWorkout(selectedGymId)
                  }
                }}
                disabled={!canStart}
              >
                Start Workout
              </button>
            </>
          ) : (
            <>
              <p className="aw-start-hint">No gyms found. Add a gym first.</p>
              <button className="aw-start-btn" onClick={() => navigate('/gyms')}>
                Open Gyms
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!w.gymId) {
    const canAssign = typeof selectedGymId === 'number'

    return (
      <div className="aw-start">
        <div className="aw-start-content">
          <Link className="aw-home-link" to="/home">
            Home
          </Link>
          {gyms.length > 0 ? (
            <>
              <label className="aw-start-label" htmlFor="aw-assign-gym-select">
                Select Gym
              </label>
              <select
                id="aw-assign-gym-select"
                className="aw-start-select"
                value={selectedGymId}
                onChange={(e) =>
                  setSelectedGymId(e.target.value ? Number.parseInt(e.target.value, 10) : '')
                }
              >
                <option value="">Choose gym…</option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.abbreviation} {gym.name}
                  </option>
                ))}
              </select>
              <button
                className="aw-start-btn"
                onClick={() => {
                  if (typeof selectedGymId === 'number') {
                    void assignGymToWorkout(w.id!, selectedGymId)
                  }
                }}
                disabled={!canAssign}
              >
                Assign Gym
              </button>
            </>
          ) : (
            <>
              <p className="aw-start-hint">No gyms found. Add a gym first.</p>
              <button className="aw-start-btn" onClick={() => navigate('/gyms')}>
                Open Gyms
              </button>
            </>
          )}
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
      {notification && (
        <div className="aw-pr-notification" role="status" aria-live="polite">
          <span className="aw-pr-icon" aria-hidden="true">🏆</span>
          <span className="aw-pr-copy">
            <strong>NEW PERSONAL RECORD</strong>
            <span>{notification.replace('New PR: ', '')}</span>
          </span>
        </div>
      )}
      <div className="aw-top-row">
        {selectedGymAbbreviation && (
          <button
            className="aw-gym-badge"
            type="button"
            onClick={() => setIsGymPickerOpen((isOpen) => !isOpen)}
            aria-expanded={isGymPickerOpen}
            aria-controls="aw-active-gym-select"
          >
            {selectedGymAbbreviation}
          </button>
        )}
        {w.id && (
          <Link
            className="aw-history-link"
            to={`/history/${w.id}`}
            state={{ returnToActiveWorkout: true }}
          >
            Today
          </Link>
        )}
        <Link className="aw-home-link" to="/home">
          Home
        </Link>
      </div>

      {isGymPickerOpen && (
        <label className="aw-active-gym-picker" htmlFor="aw-active-gym-select">
          Gym
          <select
            id="aw-active-gym-select"
            value={w.gymId}
            onChange={(event) => handleGymChange(Number.parseInt(event.target.value, 10))}
          >
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.abbreviation} {gym.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Exercise selector */}
      <button
        className="aw-exercise-btn"
        onClick={() =>
          navigate('/exercises', {
            state: { workoutId: w?.id, currentExerciseId: exercise?.id },
          })
        }
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
        <div className="aw-reps-adjustments">
          <button className="aw-reps-adjustment-btn" type="button" onClick={() => adjustReps(1)} aria-label="Increase repetitions">
            +
          </button>
          <button className="aw-reps-adjustment-btn" type="button" onClick={() => adjustReps(-1)} aria-label="Decrease repetitions">
            -
          </button>
        </div>

        <button
          className="aw-log-btn"
          onClick={logSet}
          disabled={!exercise || !w || isLogCoolingDown}
        >
          LOG
        </button>
      </div>

      {/* Numeric keypad */}
      <NumericKeypad onKey={handleKeypad} showDecimal={activeField === 'weight'} />

      {/* History */}
      {exercise?.id && (
        <div className="aw-history">
          {historyColumns.map((column, index) => (
            <Link
              key={`${index}-${column.title}`}
              className="aw-history-card"
              to={`/exercises/${exercise.id}`}
            >
              <section>
                <h3>{column.title}</h3>
                {column.sets.length > 0 ? (
                  column.sets.map((s) => (
                    <p key={s.id}>
                      {s.weight} × {s.reps}{personalRecordsByGym.get(personalRecordGroupKeyBySetId.get(s.id!) ?? 'all')?.markedSetIds.has(s.id!) && <span className="pr-star" aria-label="Personal record"> ★</span>}
                    </p>
                  ))
                ) : (
                  <p className="aw-history-empty">No sets</p>
                )}
              </section>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
