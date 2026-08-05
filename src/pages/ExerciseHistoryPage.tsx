import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import type { BodyPartGroup, Exercise, Workout, WorkoutSet } from '../db/types'
import './ExerciseHistoryPage.css'

interface WorkoutGroup {
  workout: Workout
  sets: WorkoutSet[]
}

type SetDraftMap = Record<number, { weight: string; reps: string }>
type MetaField = 'name' | 'bodyPartGroupId' | 'notes' | null

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
      setDrafts({})
      setIsLoading(false)
      return
    }

    const workoutExerciseIds = workoutExercises.map((we) => we.id!)
    const allSets = await db.workoutSets.where('workoutExerciseId').anyOf(workoutExerciseIds).toArray()

    const workoutIds = Array.from(new Set(workoutExercises.map((we) => we.workoutId)))
    const workouts = await db.workouts.where('id').anyOf(workoutIds).toArray()
    const workoutById = new Map(workouts.map((workout) => [workout.id!, workout]))
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
      </section>

      <main className="eh-list">
        {groups.length === 0 ? (
          <p className="eh-empty">No previous sets found.</p>
        ) : (
          groups.map((group) => (
            <section key={group.workout.id} className="eh-workout">
              <h2>{formatWorkoutDate(group.workout.startTime)}</h2>
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
                        <span className="eh-value-text">{set.weight} × {set.reps}</span>
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
