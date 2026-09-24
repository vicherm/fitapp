import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Gym } from '../../db/types'
import { deleteGym as removeGym, listGyms } from '../../data/gyms'
import './GymList.css'

export default function GymList() {
  const navigate = useNavigate()
  const [gyms, setGyms] = useState<Gym[]>([])

  useEffect(() => {
    void loadGyms()
  }, [])

  async function loadGyms() {
    const allGyms = await listGyms()
    setGyms(allGyms)
  }

  async function handleDeleteGym(gymId?: number) {
    if (!gymId) return
    await removeGym(gymId)
    await loadGyms()
  }

  return (
    <div className="gym-list">
      <div className="gym-list-header">
        <button className="gym-list-back" onClick={() => navigate('/home')}>
          ←
        </button>
        <h1 className="gym-list-title">Gyms</h1>
        <button className="gym-list-create" onClick={() => navigate('/gyms/create')}>
          +
        </button>
      </div>

      <ul className="gym-list-items">
        {gyms.map((gym) => (
          <li key={gym.id} className="gym-list-item">
            <button className="gym-list-select" onClick={() => navigate(`/gyms/${gym.id}/edit`)}>
              <span className="gym-list-name-row">
                <span className="gym-list-abbr">{gym.abbreviation}</span>
                <span className="gym-list-name">{gym.name}</span>
              </span>
            </button>
            <button
              className="gym-list-delete"
              onClick={() => void handleDeleteGym(gym.id)}
              aria-label={`Delete ${gym.name}`}
            >
              <span aria-hidden="true">🗑</span>
            </button>
          </li>
        ))}

        {gyms.length === 0 && <li className="gym-list-empty">No gyms yet</li>}
      </ul>
    </div>
  )
}