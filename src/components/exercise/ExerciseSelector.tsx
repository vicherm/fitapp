import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import type { BodyPartGroup, Exercise } from '../../db/types'
import './ExerciseSelector.css'

interface ExerciseGroup {
  bodyPartGroup: BodyPartGroup
  exercises: Exercise[]
}

export default function ExerciseSelector() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [bodyPartGroups, setBodyPartGroups] = useState<BodyPartGroup[]>([])
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
        {groupedExercises.map((group) => (
          <section key={group.bodyPartGroup.id} className="es-group">
            <h2 className="es-group-title">{group.bodyPartGroup.name}</h2>
            <ul className="es-group-list">
              {group.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    className="es-item"
                    onClick={() => navigate('/', { state: { selectedExercise: exercise } })}
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
          </section>
        ))}
        {filtered.length === 0 && (
          <li className="es-empty">No exercises found</li>
        )}
      </div>
    </div>
  )
}
