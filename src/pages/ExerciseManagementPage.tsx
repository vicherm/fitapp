import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import type { Exercise } from '../db/types'
import './ExerciseManagementPage.css'

export default function ExerciseManagementPage() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    db.exercises.orderBy('name').toArray().then(setExercises)
  }, [])

  const filtered = query
    ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(query.toLowerCase()))
    : exercises

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

      <ul className="em-list">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <button
              className="em-item"
              onClick={() => navigate(`/exercises/${exercise.id}`)}
            >
              {exercise.name}
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="em-empty">No exercises found</li>}
      </ul>
    </div>
  )
}
