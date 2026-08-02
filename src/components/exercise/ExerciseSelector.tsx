import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import type { Exercise } from '../../db/types'
import './ExerciseSelector.css'

export default function ExerciseSelector() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    db.exercises.orderBy('name').toArray().then(setExercises)
  }, [])

  const filtered = query
    ? exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : exercises

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
        <button className="es-new" onClick={() => navigate('/exercises/new')}>
          +
        </button>
      </div>

      <ul className="es-list">
        {filtered.map((ex) => (
          <li key={ex.id}>
            <button
              className="es-item"
              onClick={() => navigate('/', { state: { selectedExercise: ex } })}
            >
              {ex.name}
            </button>
            <button
              className="es-edit"
              onClick={() => navigate(`/exercises/${ex.id}/edit`)}
              aria-label={`Edit ${ex.name}`}
            >
              ⋯
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="es-empty">No exercises found</li>
        )}
      </ul>
    </div>
  )
}
