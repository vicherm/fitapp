import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import type { BodyPartGroup } from '../../db/types'
import './BodyPartGroupEditor.css'

export default function BodyPartGroupEditor() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<BodyPartGroup[]>([])
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  const canSaveNew = useMemo(() => newName.trim().length > 0, [newName])

  async function loadData() {
    const [loadedGroups, exercises] = await Promise.all([
      db.bodyPartGroups.orderBy('name').toArray(),
      db.exercises.toArray(),
    ])

    const usageCounts = exercises.reduce<Record<number, number>>((acc, ex) => {
      acc[ex.bodyPartGroupId] = (acc[ex.bodyPartGroupId] ?? 0) + 1
      return acc
    }, {})

    setGroups(loadedGroups)
    setUsage(usageCounts)
  }

  function normalizeName(name: string) {
    return name.trim().toLowerCase()
  }

  function hasDuplicateName(name: string, excludeId?: number) {
    const normalized = normalizeName(name)
    return groups.some(
      (group) => group.id !== excludeId && normalizeName(group.name) === normalized,
    )
  }

  async function addGroup() {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (hasDuplicateName(trimmed)) {
      setError('Group with this name already exists')
      return
    }

    await db.bodyPartGroups.add({ name: trimmed })
    setNewName('')
    setError('')
    await loadData()
  }

  function startEditing(group: BodyPartGroup) {
    setEditingId(group.id ?? null)
    setEditingName(group.name)
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName('')
  }

  async function saveEdit(groupId: number) {
    const trimmed = editingName.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }

    if (hasDuplicateName(trimmed, groupId)) {
      setError('Group with this name already exists')
      return
    }

    await db.bodyPartGroups.update(groupId, { name: trimmed })
    cancelEditing()
    setError('')
    await loadData()
  }

  async function deleteGroup(group: BodyPartGroup) {
    const groupId = group.id
    if (!groupId) return

    if ((usage[groupId] ?? 0) > 0) {
      setError('Cannot delete a group that is used by exercises')
      return
    }

    await db.bodyPartGroups.delete(groupId)
    setError('')
    await loadData()
  }

  return (
    <div className="bpg">
      <div className="bpg-header">
        <button className="bpg-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="bpg-title">Body Part Groups</h1>
      </div>

      <div className="bpg-content">
        {error && <p className="bpg-error">{error}</p>}

        <div className="bpg-add-row">
          <input
            className="bpg-input"
            type="text"
            placeholder="Add group (e.g. Chest)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="bpg-add-btn" onClick={addGroup} disabled={!canSaveNew}>
            Add
          </button>
        </div>

        <ul className="bpg-list">
          {groups.map((group) => {
            const groupId = group.id
            const inEditMode = editingId === groupId

            return (
              <li key={groupId} className="bpg-item">
                {inEditMode ? (
                  <>
                    <input
                      className="bpg-input"
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                    />
                    <button className="bpg-action" onClick={() => groupId && saveEdit(groupId)}>
                      Save
                    </button>
                    <button className="bpg-action bpg-muted" onClick={cancelEditing}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bpg-name-wrap">
                      <span className="bpg-name">{group.name}</span>
                      <span className="bpg-usage">{usage[groupId ?? -1] ?? 0} exercises</span>
                    </div>
                    <button className="bpg-action" onClick={() => startEditing(group)}>
                      Edit
                    </button>
                    <button className="bpg-action bpg-danger" onClick={() => void deleteGroup(group)}>
                      Delete
                    </button>
                  </>
                )}
              </li>
            )
          })}

          {groups.length === 0 && <li className="bpg-empty">No body part groups yet</li>}
        </ul>
      </div>
    </div>
  )
}
