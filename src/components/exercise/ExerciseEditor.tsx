import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import type { BodyPartGroup } from '../../db/types'
import './ExerciseEditor.css'

interface Props {
  exerciseId?: number
}

export default function ExerciseEditor({ exerciseId }: Props) {
  const navigate = useNavigate()
  const isNew = exerciseId === undefined

  const [name, setName] = useState('')
  const [bodyPartGroupId, setBodyPartGroupId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [groups, setGroups] = useState<BodyPartGroup[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    db.bodyPartGroups.orderBy('name').toArray().then(setGroups)
    if (!isNew) {
      db.exercises.get(exerciseId!).then((ex) => {
        if (ex) {
          setName(ex.name)
          setBodyPartGroupId(ex.bodyPartGroupId)
          setNotes(ex.notes ?? '')
        }
      })
    }
  }, [exerciseId, isNew])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    if (bodyPartGroupId === '') {
      setError('Body part group is required')
      return
    }

    if (isNew) {
      await db.exercises.add({ name: trimmed, bodyPartGroupId: bodyPartGroupId as number, notes: notes.trim() || undefined })
    } else {
      await db.exercises.update(exerciseId!, { name: trimmed, bodyPartGroupId: bodyPartGroupId as number, notes: notes.trim() || undefined })
    }
    navigate(-1)
  }

  async function remove() {
    if (!exerciseId) return
    await db.exercises.delete(exerciseId)
    navigate(-1)
  }

  return (
    <div className="ee">
      <div className="ee-header">
        <button className="ee-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="ee-title">{isNew ? 'New Exercise' : 'Edit Exercise'}</h1>
      </div>

      <div className="ee-form">
        {error && <p className="ee-error">{error}</p>}

        <label className="ee-label">
          Name
          <input
            className="ee-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bench Press"
            autoFocus={isNew}
          />
        </label>

        <label className="ee-label">
          Body Part Group
          <select
            className="ee-input"
            value={bodyPartGroupId}
            onChange={(e) => setBodyPartGroupId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— select —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ee-label">
          Notes
          <textarea
            className="ee-input ee-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes…"
          />
        </label>

        <button className="ee-save-btn" onClick={save}>
          {isNew ? 'Add Exercise' : 'Save'}
        </button>

        {!isNew && (
          <button className="ee-delete-btn" onClick={remove}>
            Delete Exercise
          </button>
        )}
      </div>
    </div>
  )
}
