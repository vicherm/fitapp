import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { BodyPartGroup, Exercise } from '../db/types'
import './ExerciseManagementPage.css'

interface ExerciseGroup {
  bodyPartGroup: BodyPartGroup
  exercises: Exercise[]
}

export default function ExerciseManagementPage() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [bodyPartGroups, setBodyPartGroups] = useState<BodyPartGroup[]>([])
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    void Promise.all([
      db.exercises.orderBy('name').toArray(),
      db.bodyPartGroups.orderBy('name').toArray(),
    ]).then(([nextExercises, nextBodyPartGroups]) => {
      setExercises(nextExercises)
      setBodyPartGroups(nextBodyPartGroups)
    })
  }, [])

  const filtered = query
    ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(query.toLowerCase()))
    : exercises

  const groupedExercises: ExerciseGroup[] = bodyPartGroups
    .map((bodyPartGroup) => {
      const groupExercises = filtered
        .filter((exercise) => exercise.bodyPartGroupId === bodyPartGroup.id)
        .sort((left, right) => left.name.localeCompare(right.name))

      return groupExercises.length > 0 ? { bodyPartGroup, exercises: groupExercises } : null
    })
    .filter((group): group is ExerciseGroup => Boolean(group))

  const unassignedExercises = filtered
    .filter((exercise) => !bodyPartGroups.some((group) => group.id === exercise.bodyPartGroupId))
    .sort((left, right) => left.name.localeCompare(right.name))

  if (unassignedExercises.length > 0) {
    groupedExercises.push({ bodyPartGroup: { id: 0, name: 'Unassigned' }, exercises: unassignedExercises })
  }

  groupedExercises.sort((left, right) => left.bodyPartGroup.name.localeCompare(right.bodyPartGroup.name))

  function toggleGroup(groupId: number) {
    setExpandedGroupIds((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <div className="em">
      <header className="em-header">
        <button className="em-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="em-title">Exercises</h1>
      </header>

      <div className="em-actions">
        <button className="em-create" onClick={() => navigate('/exercises/create')}>
          Create New Exercise
        </button>
      </div>

      <input
        className="em-search"
        type="search"
        placeholder="Select existing exercise..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="em-list">
        {groupedExercises.map((group) => {
          const groupId = group.bodyPartGroup.id!
          const isExpanded = query.length > 0 || expandedGroupIds.has(groupId)

          return (
            <section key={groupId} className="em-group">
              <button
                className="em-group-title"
                onClick={() => toggleGroup(groupId)}
                aria-expanded={isExpanded}
              >
                <span className={`em-group-chevron ${isExpanded ? 'expanded' : ''}`}>›</span>
                {group.bodyPartGroup.name}
              </button>
              {isExpanded && (
                <ul className="em-group-list">
                  {group.exercises.map((exercise) => (
                    <li key={exercise.id}>
                      <button
                        className="em-item"
                        onClick={() => navigate(`/exercises/${exercise.id}`)}
                      >
                        {exercise.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        {filtered.length === 0 && <p className="em-empty">No exercises found</p>}
      </div>
    </div>
  )
}
