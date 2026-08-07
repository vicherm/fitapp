import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import './GymEditor.css'

interface GymFormState {
  name: string
  abbreviation: string
  latitude: string
  longitude: string
}

type ParsedCoordinatesResult =
  | { error: string }
  | { latitude: number; longitude: number }

const EMPTY_FORM: GymFormState = {
  name: '',
  abbreviation: '',
  latitude: '',
  longitude: '',
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function formatCoordinate(value: number): string {
  return value.toFixed(6)
}

function parseCoordinates(latitude: string, longitude: string): ParsedCoordinatesResult {
  const lat = Number.parseFloat(latitude)
  const lon = Number.parseFloat(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: 'Latitude and longitude must be valid numbers' }
  }

  if (lat < -90 || lat > 90) {
    return { error: 'Latitude must be between -90 and 90' }
  }

  if (lon < -180 || lon > 180) {
    return { error: 'Longitude must be between -180 and 180' }
  }

  return { latitude: lat, longitude: lon }
}

interface Props {
  gymId?: number
}

export default function GymEditor({ gymId }: Props) {
  const navigate = useNavigate()
  const [existingGyms, setExistingGyms] = useState<Array<{ id?: number; name: string; abbreviation: string }>>([])
  const [form, setForm] = useState<GymFormState>(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(Boolean(gymId))
  const [error, setError] = useState('')

  useEffect(() => {
    void loadData()
  }, [gymId])

  const canSave = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.abbreviation.trim().length > 0 &&
      form.latitude.trim().length > 0 &&
      form.longitude.trim().length > 0
    )
  }, [form])

  async function loadData() {
    const allGyms = await db.gyms.orderBy('name').toArray()
    setExistingGyms(allGyms)

    if (!gymId) {
      setForm(EMPTY_FORM)
      setIsLoading(false)
      return
    }

    const gym = await db.gyms.get(gymId)
    if (!gym) {
      setError('Gym not found')
      setIsLoading(false)
      return
    }

    setForm({
      name: gym.name,
      abbreviation: gym.abbreviation,
      latitude: formatCoordinate(gym.latitude),
      longitude: formatCoordinate(gym.longitude),
    })
    setIsLoading(false)
  }

  function hasDuplicateName(name: string, excludeId?: number) {
    const normalized = normalizeText(name)
    return existingGyms.some(
      (gym) => gym.id !== excludeId && normalizeText(gym.name) === normalized,
    )
  }

  function hasDuplicateAbbreviation(abbreviation: string, excludeId?: number) {
    const normalized = normalizeText(abbreviation)
    return existingGyms.some(
      (gym) => gym.id !== excludeId && normalizeText(gym.abbreviation) === normalized,
    )
  }

  async function saveGym() {
    const name = form.name.trim()
    const abbreviation = form.abbreviation.trim()

    if (!name) {
      setError('Gym name is required')
      return
    }

    if (!abbreviation) {
      setError('Abbreviation is required')
      return
    }

    if (hasDuplicateName(name, gymId)) {
      setError('Gym with this name already exists')
      return
    }

    if (hasDuplicateAbbreviation(abbreviation, gymId)) {
      setError('Gym with this abbreviation already exists')
      return
    }

    const parsed = parseCoordinates(form.latitude.trim(), form.longitude.trim())
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }

    if (gymId) {
      await db.gyms.update(gymId, {
        name,
        abbreviation,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      })
    } else {
      if (hasDuplicateName(name)) {
        setError('Gym with this name already exists')
        return
      }

      if (hasDuplicateAbbreviation(abbreviation)) {
        setError('Gym with this abbreviation already exists')
        return
      }

      await db.gyms.add({
        name,
        abbreviation,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      })
    }

    setError('')
    navigate('/gyms')
  }

  if (isLoading) {
    return <div className="gym-editor-loading">Loading…</div>
  }

  return (
    <div className="gym-editor">
      <div className="gym-editor-header">
        <button className="gym-editor-back" onClick={() => navigate('/gyms')}>
          ←
        </button>
        <h1 className="gym-editor-title">{gymId ? 'Edit Gym' : 'Create Gym'}</h1>
      </div>

      <div className="gym-editor-content">
        {error && <p className="gym-editor-error">{error}</p>}

        <div className="gym-editor-form">
          <input
            className="gym-editor-input"
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="gym-editor-input"
            type="text"
            placeholder="Abbreviation"
            value={form.abbreviation}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, abbreviation: e.target.value }))
            }
          />
          <input
            className="gym-editor-input"
            type="text"
            inputMode="decimal"
            placeholder="Latitude"
            value={form.latitude}
            onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))}
          />
          <input
            className="gym-editor-input"
            type="text"
            inputMode="decimal"
            placeholder="Longitude"
            value={form.longitude}
            onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))}
          />
          <button className="gym-editor-add" onClick={saveGym} disabled={!canSave}>
            {gymId ? 'Save Gym' : 'Create Gym'}
          </button>
        </div>
      </div>
    </div>
  )
}