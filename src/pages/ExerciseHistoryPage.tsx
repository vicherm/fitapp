import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { BodyPartGroup, Exercise, Workout, WorkoutSet } from '../db/types'
import { listBodyPartGroups } from '../data/bodyPartGroups'
import { getExercise, updateExercise } from '../data/exercises'
import { listGyms } from '../data/gyms'
import {
  createWorkoutExercise,
  deleteWorkoutExercise,
  deleteWorkoutSet,
  listWorkoutExercises,
  listWorkoutSets,
  listWorkouts,
  updateWorkoutSet,
} from '../data/workouts'
import {
  calculatePersonalRecords,
  calculatePersonalRecordsByGym,
  getPersonalRecordGroupKey,
  type PersonalRecords,
} from '../features/personalRecords'
import './ExerciseHistoryPage.css'

interface WorkoutGroup {
  workout: Workout
  gymAbbreviation: string
  sets: WorkoutSet[]
}

type SetDraftMap = Record<number, { weight: string; reps: string }>
type MetaField = 'name' | 'bodyPartGroupId' | 'notes' | null
interface SetCorrection {
  sourceExerciseId: number
  workoutId: number
  setId: number
  targetExerciseId?: number
}

function summarizePersonalRecords(records: Map<number, WorkoutSet>): Array<[number, WorkoutSet]> {
  const entries = [...records.entries()].sort(([left], [right]) => left - right)
  return entries.filter(([, set], index) => index === entries.length - 1 || set.weight !== entries[index + 1][1].weight)
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

function resolveGymAbbreviation(gymId: number | undefined, gymById: Map<number, string>): string {
  if (!gymId) return 'UNKN'
  return gymById.get(gymId) ?? 'UNKN'
}

function parseWeightInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRepsInput(value: string): number | null {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) ? parsed : null
}

export default function ExerciseHistoryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()

  const exerciseId = useMemo(() => Number(id), [id])
  const [isLoading, setIsLoading] = useState(true)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [drafts, setDrafts] = useState<SetDraftMap>({})
  const [personalRecordsByGym, setPersonalRecordsByGym] = useState<Map<string, PersonalRecords>>(
    () => new Map([['all', calculatePersonalRecords([])]]),
  )
  const [personalRecordGroupKeyBySetId, setPersonalRecordGroupKeyBySetId] = useState<Map<number, string>>(new Map())
  const [personalRecordGymLabels, setPersonalRecordGymLabels] = useState<Map<string, string>>(new Map())
  const [editingSetId, setEditingSetId] = useState<number | null>(null)
  const [bodyPartGroups, setBodyPartGroups] = useState<BodyPartGroup[]>([])
  const [editingMetaField, setEditingMetaField] = useState<MetaField>(null)
  const [exerciseNameDraft, setExerciseNameDraft] = useState('')
  const [exerciseNotesDraft, setExerciseNotesDraft] = useState('')

  const loadHistory = useCallback(async () => {
    if (!Number.isFinite(exerciseId) || exerciseId <= 0) {
      setIsLoading(false)
      return
    }

    const ex = await getExercise(exerciseId)
    setExercise(ex ?? null)
    setExerciseNameDraft(ex?.name ?? '')
    setExerciseNotesDraft(ex?.notes ?? '')

    const groups = await listBodyPartGroups()
    setBodyPartGroups(groups)

    if (!ex) {
      setGroups([])
      setDrafts({})
      setIsLoading(false)
      return
    }

    const workoutExercises = (await listWorkoutExercises()).filter((entry) => entry.exerciseId === exerciseId)

    if (workoutExercises.length === 0) {
      setGroups([])
      setPersonalRecordsByGym(new Map([['all', calculatePersonalRecords([])]]))
      setPersonalRecordGroupKeyBySetId(new Map())
      setDrafts({})
      setIsLoading(false)
      return
    }

    const workoutExerciseIds = workoutExercises.map((we) => we.id!)
    const allSets = await listWorkoutSets(workoutExerciseIds)

    const workoutIds = Array.from(new Set(workoutExercises.map((we) => we.workoutId)))
    const workouts = (await listWorkouts()).filter((workout) => workoutIds.includes(workout.id!))
    const workoutById = new Map(workouts.map((workout) => [workout.id!, workout]))
    const gymIds = Array.from(
      new Set(workouts.map((workout) => workout.gymId).filter((gymId): gymId is number => Boolean(gymId))),
    )
    const gyms = gymIds.length > 0 ? (await listGyms()).filter((gym) => gymIds.includes(gym.id!)) : []
    const gymById = new Map(gyms.map((gym) => [gym.id!, gym.abbreviation]))
    const gymIdByWorkoutExerciseId = new Map(
      workoutExercises.map((workoutExercise) => [workoutExercise.id!, workoutById.get(workoutExercise.workoutId)?.gymId]),
    )
    const separateByGym = ex.machine === true
    setPersonalRecordsByGym(calculatePersonalRecordsByGym(allSets, gymIdByWorkoutExerciseId, separateByGym))
    setPersonalRecordGroupKeyBySetId(
      new Map(
        allSets.map((set) => [
          set.id!,
          getPersonalRecordGroupKey(gymIdByWorkoutExerciseId.get(set.workoutExerciseId), separateByGym),
        ]),
      ),
    )
    setPersonalRecordGymLabels(
      new Map([
        ['unknown', 'Unknown gym'],
        ...gyms.map((gym) => [String(gym.id), gym.name] as [string, string]),
      ]),
    )
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
        gymAbbreviation: resolveGymAbbreviation(workoutById.get(workoutId)?.gymId, gymById),
        sets: [...sets].sort((a, b) => {
          if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
          return a.timestamp.getTime() - b.timestamp.getTime()
        }),
      }))
      .filter((group): group is WorkoutGroup => Boolean(group.workout))
      .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime())

    const nextDrafts: SetDraftMap = {}
    for (const group of grouped) {
      for (const set of group.sets) {
        if (!set.id) continue
        nextDrafts[set.id] = { weight: String(set.weight), reps: String(set.reps) }
      }
    }

    setGroups(grouped)
    setDrafts(nextDrafts)
    setIsLoading(false)
  }, [exerciseId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  function updateSetState(setId: number, patch: Partial<WorkoutSet>) {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        sets: group.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
      })),
    )
  }

  async function refreshPersonalRecords() {
    if (!exercise?.id) return
    const workoutExercises = (await listWorkoutExercises()).filter((entry) => entry.exerciseId === exercise.id)
    const sets = await listWorkoutSets(workoutExercises.map((entry) => entry.id!))
    const workouts = (await listWorkouts()).filter((workout) => workoutExercises.some((entry) => entry.workoutId === workout.id))
    const gymIdByWorkoutExerciseId = new Map(
      workoutExercises.map((entry) => [entry.id!, workouts.find((workout) => workout.id === entry.workoutId)?.gymId]),
    )
    setPersonalRecordsByGym(calculatePersonalRecordsByGym(
      sets,
      gymIdByWorkoutExerciseId,
      exercise.machine === true,
    ))
  }

  async function handleExerciseNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setExerciseNameDraft(value)

    const trimmed = value.trim()
    if (!exercise?.id || trimmed.length === 0) return

    await updateExercise(exercise.id, { name: trimmed })
    setExercise((prev) => (prev ? { ...prev, name: trimmed } : prev))
  }

  async function handleBodyPartGroupChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextGroupId = Number(event.target.value)
    if (!exercise?.id || !Number.isFinite(nextGroupId) || nextGroupId <= 0) return

    await updateExercise(exercise.id, { bodyPartGroupId: nextGroupId })
    setExercise((prev) => (prev ? { ...prev, bodyPartGroupId: nextGroupId } : prev))
  }

  async function handleExerciseNotesChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setExerciseNotesDraft(value)
    if (!exercise?.id) return

    await updateExercise(exercise.id, { notes: value })
    setExercise((prev) => (prev ? { ...prev, notes: value } : prev))
  }

  async function handleWeightChange(setId: number, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setDrafts((prev) => ({
      ...prev,
      [setId]: { ...prev[setId], weight: value },
    }))

    const parsed = parseWeightInput(value)
    if (parsed === null) return
    await updateWorkoutSet(setId, { weight: parsed })
    updateSetState(setId, { weight: parsed })
    await refreshPersonalRecords()
  }

  async function handleRepsChange(setId: number, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setDrafts((prev) => ({
      ...prev,
      [setId]: { ...prev[setId], reps: value },
    }))

    const parsed = parseRepsInput(value)
    if (parsed === null) return
    await updateWorkoutSet(setId, { reps: parsed })
    updateSetState(setId, { reps: parsed })
    await refreshPersonalRecords()
  }

  async function handleDeleteSet(set: WorkoutSet) {
    if (!set.id) return
    await deleteWorkoutSet(set.id)
    setEditingSetId(null)

    const remaining = (await listWorkoutSets([set.workoutExerciseId])).sort((left, right) => left.setNumber - right.setNumber)
    const resequenced = remaining.map((entry, index) => ({
      ...entry,
      setNumber: index + 1,
    }))
    await Promise.all(resequenced.map((entry) => updateWorkoutSet(entry.id!, { setNumber: entry.setNumber })))

    await loadHistory()
  }

  async function handleCorrectExercise(workoutId: number, setId: number, exerciseId: number) {
    if (!exercise?.id || exerciseId === exercise.id) {
      return
    }

    const set = (await listWorkoutSets()).find((entry) => entry.id === setId)
    if (!set) return
    const workoutExercises = await listWorkoutExercises([workoutId])
    const sourceWorkoutExercise = workoutExercises.find((workoutExercise) => workoutExercise.id === set.workoutExerciseId)
    if (!sourceWorkoutExercise) return

    let targetWorkoutExercise = workoutExercises.find((workoutExercise) => workoutExercise.exerciseId === exerciseId)
    if (!targetWorkoutExercise) {
      const order = Math.max(-1, ...workoutExercises.map((workoutExercise) => workoutExercise.order)) + 1
      targetWorkoutExercise = await createWorkoutExercise({ workoutId, exerciseId, order })
    }
    if (!targetWorkoutExercise) return

    await updateWorkoutSet(set.id!, { workoutExerciseId: targetWorkoutExercise.id! })

    const targetSets = await listWorkoutSets([targetWorkoutExercise.id!])
    await Promise.all(targetSets
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .map((targetSet, index) => updateWorkoutSet(targetSet.id!, { setNumber: index + 1 })))

    const remainingSourceSets = await listWorkoutSets([sourceWorkoutExercise.id!])
    if (remainingSourceSets.length === 0) {
      await deleteWorkoutExercise(sourceWorkoutExercise.id!)
      return
    }
    await Promise.all(remainingSourceSets
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .map((sourceSet, index) => updateWorkoutSet(sourceSet.id!, { setNumber: index + 1 })))

    await loadHistory()
  }

  const correction = location.state?.correction as SetCorrection | undefined
  useEffect(() => {
    if (isLoading || !correction?.targetExerciseId || correction.sourceExerciseId !== exerciseId) return

    navigate(location.pathname, { replace: true })
    void handleCorrectExercise(correction.workoutId, correction.setId, correction.targetExerciseId)
  }, [correction, exerciseId, isLoading, location.pathname, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <p className="eh-subtitle">Exercise Details</p>
          {editingMetaField === 'name' ? (
            <input
              className="eh-title-input"
              value={exerciseNameDraft}
              onChange={(event) => void handleExerciseNameChange(event)}
              onBlur={() => setEditingMetaField(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setEditingMetaField(null)
                }
              }}
              autoFocus
              aria-label="Exercise name"
            />
          ) : (
            <h1
              className="eh-title eh-clickable"
              onClick={() => setEditingMetaField('name')}
            >
              {exercise?.name ?? 'Unknown exercise'}
            </h1>
          )}
        </div>
      </header>

      <section className="eh-meta" aria-label="Exercise details">
        <div
          className={`eh-meta-row eh-inline-meta-row ${editingMetaField === 'bodyPartGroupId' ? 'is-editing' : ''}`}
          onClick={() => editingMetaField !== 'bodyPartGroupId' && setEditingMetaField('bodyPartGroupId')}
        >
          <span className="eh-meta-label">Body Parts</span>
          {editingMetaField === 'bodyPartGroupId' ? (
            <select
              className="eh-meta-select"
              value={exercise?.bodyPartGroupId ?? ''}
              onChange={(event) => void handleBodyPartGroupChange(event)}
              onBlur={() => setEditingMetaField(null)}
              autoFocus
              aria-label="Body part group"
            >
              {bodyPartGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="eh-meta-value">
              {bodyPartGroups.find((group) => group.id === exercise?.bodyPartGroupId)?.name ?? 'Unassigned'}
            </span>
          )}
        </div>

        <div
          className={`eh-meta-row ${editingMetaField === 'notes' ? 'is-editing' : ''}`}
          onClick={() => editingMetaField !== 'notes' && setEditingMetaField('notes')}
        >
          <span className="eh-meta-label">Note</span>
          {editingMetaField === 'notes' ? (
            <input
              className="eh-meta-input"
              value={exerciseNotesDraft}
              onChange={(event) => void handleExerciseNotesChange(event)}
              onBlur={() => setEditingMetaField(null)}
              autoFocus
              aria-label="Exercise note"
            />
          ) : exercise?.notes?.trim() ? (
            <span className="eh-meta-value">{exercise.notes}</span>
          ) : null}
        </div>

        <label className="eh-meta-row eh-machine-row">
          <span className="eh-meta-label">Machine</span>
          <span className="eh-meta-value eh-machine-value">
            <input
              type="checkbox"
              checked={exercise?.machine === true}
              onChange={(event) => {
                if (!exercise?.id) return
                const machine = event.target.checked
                void updateExercise(exercise.id, { machine })
                setExercise((previous) => (previous ? { ...previous, machine } : previous))
              }}
            />
            {exercise?.machine === true ? 'Yes' : 'No'}
          </span>
        </label>
      </section>

      <section className="eh-records" aria-label="Current personal records">
        {[...personalRecordsByGym.entries()].map(([groupKey, personalRecords]) => (
          <div className="eh-record-group" key={groupKey}>
            {personalRecordsByGym.size > 1 && <h3>{personalRecordGymLabels.get(groupKey) ?? groupKey}</h3>}
            {personalRecords.maximumWeight && (
              <div className="eh-record-row">
                <span>Maximum Weight</span>
                <strong>{personalRecords.maximumWeight.weight} × {personalRecords.maximumWeight.reps}</strong>
              </div>
            )}
            {summarizePersonalRecords(personalRecords.maximumWeightByRepetitions).map(([repetitions, set]) => (
              <div className="eh-record-row" key={repetitions}>
                <span>{repetitions} {repetitions === 1 ? 'rep' : 'reps'}</span>
                <strong>{set.weight} kg</strong>
              </div>
            ))}
            {!personalRecords.maximumWeight && <p className="eh-empty">No records yet.</p>}
          </div>
        ))}
      </section>

      <main className="eh-list">
        {groups.length === 0 ? (
          <p className="eh-empty">No previous sets found.</p>
        ) : (
          groups.map((group) => (
            <section key={group.workout.id} className="eh-workout">
              <h2>
                <span>{formatWorkoutDate(group.workout.startTime)}</span>
                <span className="eh-workout-gym">{group.gymAbbreviation}</span>
              </h2>
              {group.sets.map((set) => {
                const isEditing = Boolean(set.id && editingSetId === set.id)
                return (
                  <div
                    key={set.id}
                    className={`eh-row ${isEditing ? 'is-editing' : ''}`}
                    onClick={() => {
                      if (!isEditing && set.id) setEditingSetId(set.id)
                    }}
                  >
                    {isEditing ? (
                      <>
                        <div className="eh-value-edit">
                          <input
                            className="eh-number-input"
                            inputMode="decimal"
                            autoFocus
                            value={set.id ? (drafts[set.id]?.weight ?? String(set.weight)) : String(set.weight)}
                            onChange={(event) => set.id && void handleWeightChange(set.id, event)}
                            aria-label="Weight in kilograms"
                          />
                          <span>×</span>
                          <input
                            className="eh-number-input"
                            inputMode="numeric"
                            value={set.id ? (drafts[set.id]?.reps ?? String(set.reps)) : String(set.reps)}
                            onChange={(event) => set.id && void handleRepsChange(set.id, event)}
                            aria-label="Repetitions"
                          />
                        </div>
                        <div className="eh-actions">
                          <button
                            className="eh-done"
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingSetId(null)
                            }}
                            aria-label="Done editing set"
                          >
                            Done
                          </button>
                          <button
                            className="eh-correct-exercise"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              navigate('/exercises', {
                                state: {
                                  correction: {
                                    sourceExerciseId: exercise!.id!,
                                    workoutId: group.workout.id!,
                                    setId: set.id!,
                                  } satisfies SetCorrection,
                                },
                              })
                            }}
                          >
                            Correct exercise
                          </button>
                          <button
                            className="eh-delete"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteSet(set)
                            }}
                            aria-label="Delete set"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="eh-value-text">{set.weight} × {set.reps}{personalRecordsByGym.get(personalRecordGroupKeyBySetId.get(set.id!) ?? 'all')?.markedSetIds.has(set.id!) && <span className="pr-star" aria-label="Personal record"> ★</span>}</span>
                        <span className="eh-time">{formatSetTime(set.timestamp)}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
