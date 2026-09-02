import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import type { BodyPartGroup, Exercise, Workout, WorkoutSet } from '../db/types'
import { calculatePersonalRecords, type PersonalRecords } from '../features/personalRecords'
import './ExerciseHistoryPage.css'

interface WorkoutGroup {
  workout: Workout
  gymAbbreviation: string
  sets: WorkoutSet[]
}

type SetDraftMap = Record<number, { weight: string; reps: string }>
type MetaField = 'name' | 'bodyPartGroupId' | 'notes' | null

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
  const { id } = useParams<{ id: string }>()

  const exerciseId = useMemo(() => Number(id), [id])
  const [isLoading, setIsLoading] = useState(true)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [drafts, setDrafts] = useState<SetDraftMap>({})
  const [personalRecords, setPersonalRecords] = useState<PersonalRecords>(() => calculatePersonalRecords([]))
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

    const ex = await db.exercises.get(exerciseId)
    setExercise(ex ?? null)
    setExerciseNameDraft(ex?.name ?? '')
    setExerciseNotesDraft(ex?.notes ?? '')

    const groups = await db.bodyPartGroups.orderBy('name').toArray()
    setBodyPartGroups(groups)

    if (!ex) {
      setGroups([])
      setDrafts({})
      setIsLoading(false)
      return
    }

    const workoutExercises = await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray()

    if (workoutExercises.length === 0) {
      setGroups([])
      setPersonalRecords(calculatePersonalRecords([]))
      setDrafts({})
      setIsLoading(false)
      return
    }

    const workoutExerciseIds = workoutExercises.map((we) => we.id!)
    const allSets = await db.workoutSets.where('workoutExerciseId').anyOf(workoutExerciseIds).toArray()
    setPersonalRecords(calculatePersonalRecords(allSets))

    const workoutIds = Array.from(new Set(workoutExercises.map((we) => we.workoutId)))
    const workouts = await db.workouts.where('id').anyOf(workoutIds).toArray()
    const workoutById = new Map(workouts.map((workout) => [workout.id!, workout]))
    const gymIds = Array.from(
      new Set(workouts.map((workout) => workout.gymId).filter((gymId): gymId is number => Boolean(gymId))),
    )
    const gyms = gymIds.length > 0 ? await db.gyms.where('id').anyOf(gymIds).toArray() : []
    const gymById = new Map(gyms.map((gym) => [gym.id!, gym.abbreviation]))
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
    const workoutExercises = await db.workoutExercises.where('exerciseId').equals(exercise.id).toArray()
    const sets = await db.workoutSets
      .where('workoutExerciseId')
      .anyOf(workoutExercises.map((entry) => entry.id!))
      .toArray()
    setPersonalRecords(calculatePersonalRecords(sets))
  }

  async function handleExerciseNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setExerciseNameDraft(value)

    const trimmed = value.trim()
    if (!exercise?.id || trimmed.length === 0) return

    await db.exercises.update(exercise.id, { name: trimmed })
    setExercise((prev) => (prev ? { ...prev, name: trimmed } : prev))
  }

  async function handleBodyPartGroupChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextGroupId = Number(event.target.value)
    if (!exercise?.id || !Number.isFinite(nextGroupId) || nextGroupId <= 0) return

    await db.exercises.update(exercise.id, { bodyPartGroupId: nextGroupId })
    setExercise((prev) => (prev ? { ...prev, bodyPartGroupId: nextGroupId } : prev))
  }

  async function handleExerciseNotesChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setExerciseNotesDraft(value)
    if (!exercise?.id) return

    await db.exercises.update(exercise.id, { notes: value })
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
    await db.workoutSets.update(setId, { weight: parsed })
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
    await db.workoutSets.update(setId, { reps: parsed })
    updateSetState(setId, { reps: parsed })
    await refreshPersonalRecords()
  }

  async function handleDeleteSet(set: WorkoutSet) {
    if (!set.id) return
    await db.workoutSets.delete(set.id)
    setEditingSetId(null)

    const remaining = await db.workoutSets.where('workoutExerciseId').equals(set.workoutExerciseId).sortBy('setNumber')
    const resequenced = remaining.map((entry, index) => ({
      ...entry,
      setNumber: index + 1,
    }))
    await db.workoutSets.bulkPut(resequenced)

    await loadHistory()
  }

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
          className={`eh-meta-row ${editingMetaField === 'bodyPartGroupId' ? 'is-editing' : ''}`}
          onClick={() => editingMetaField !== 'bodyPartGroupId' && setEditingMetaField('bodyPartGroupId')}
        >
          <span className="eh-meta-label">Body Part Group</span>
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
          ) : (
            <span className="eh-meta-value">{exercise?.notes?.trim() ? exercise.notes : 'No note'}</span>
          )}
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
                void db.exercises.update(exercise.id, { machine })
                setExercise((prev) => (prev ? { ...prev, machine } : prev))
              }}
            />
            {exercise?.machine === true ? 'Yes' : 'No'}
          </span>
        </label>
      </section>

      <section className="eh-records" aria-label="Current personal records">
        <h2>Personal Records</h2>
        {personalRecords.maximumWeight && (
          <div className="eh-record-row">
            <span>Maximum Weight</span>
            <strong>{personalRecords.maximumWeight.weight} × {personalRecords.maximumWeight.reps}</strong>
          </div>
        )}
        {summarizePersonalRecords(personalRecords.maximumWeightByRepetitions)
          .map(([repetitions, set]) => (
            <div className="eh-record-row" key={repetitions}>
              <span>{repetitions} {repetitions === 1 ? 'rep' : 'reps'}</span>
              <strong>{set.weight} kg</strong>
            </div>
          ))}
        {!personalRecords.maximumWeight && <p className="eh-empty">No records yet.</p>}
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
                          {personalRecords.markedSetIds.has(set.id!) && <span className="pr-star" aria-label="Personal record">★</span>}
                        </div>
                        <span className="eh-time">{formatSetTime(set.timestamp)}</span>
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
                        <span className="eh-value-text">{set.weight} × {set.reps}{personalRecords.markedSetIds.has(set.id!) && <span className="pr-star" aria-label="Personal record"> ★</span>}</span>
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
