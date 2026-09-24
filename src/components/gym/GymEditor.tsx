import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGym, getGym, listGyms, updateGym } from '../../data/gyms'
import './GymEditor.css'

interface GymFormState {
  name: string
  abbreviation: string
  coordinates: string
}

type ParsedCoordinatesResult =
  | { error: string }
  | { latitude: number; longitude: number }

const EMPTY_FORM: GymFormState = {
  name: '',
  abbreviation: '',
  coordinates: '',
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function formatCoordinatePart(value: number, positiveHemisphere: string, negativeHemisphere: string, degreeWidth: number): string {
  const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere
  const absoluteValue = Math.abs(value)
  let degrees = Math.floor(absoluteValue)
  let minutes = (absoluteValue - degrees) * 60

  if (minutes >= 59.9995) {
    degrees += 1
    minutes = 0
  }

  return `${hemisphere} ${String(degrees).padStart(degreeWidth, '0')}° ${minutes.toFixed(3).padStart(6, '0')}`
}

function formatCoordinates(latitude: number, longitude: number): string {
  return `${formatCoordinatePart(latitude, 'N', 'S', 2)} ${formatCoordinatePart(longitude, 'E', 'W', 3)}`
}

function parseCoordinates(coordinates: string): ParsedCoordinatesResult {
  const match = coordinates.trim().match(/^([NS])\s*(\d{1,2})°\s*(\d+(?:\.\d+)?)\s+([EW])\s*(\d{1,3})°\s*(\d+(?:\.\d+)?)$/i)
  if (!match) {
    return { error: 'Use coordinates like N 50° 20.935 E 014° 49.149' }
  }

  const [, latitudeHemisphere, latitudeDegrees, latitudeMinutes, longitudeHemisphere, longitudeDegrees, longitudeMinutes] = match
  const lat = Number.parseInt(latitudeDegrees, 10) + Number.parseFloat(latitudeMinutes) / 60
  const lon = Number.parseInt(longitudeDegrees, 10) + Number.parseFloat(longitudeMinutes) / 60

  if (Number.parseFloat(latitudeMinutes) >= 60 || Number.parseFloat(longitudeMinutes) >= 60) {
    return { error: 'Coordinate minutes must be less than 60' }
  }

  if (lat < -90 || lat > 90) {
    return { error: 'Latitude must be between -90 and 90' }
  }

  if (lon < -180 || lon > 180) {
    return { error: 'Longitude must be between -180 and 180' }
  }

  return {
    latitude: latitudeHemisphere.toUpperCase() === 'S' ? -lat : lat,
    longitude: longitudeHemisphere.toUpperCase() === 'W' ? -lon : lon,
  }
}

interface Props {
  gymId?: number
}

export default function GymEditor({ gymId }: Props) {
  const navigate = useNavigate()
  const [existingGyms, setExistingGyms] = useState<Array<{ id?: number; name: string; abbreviation: string }>>([])
  const [form, setForm] = useState<GymFormState>(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [locationMessage, setLocationMessage] = useState('')

  useEffect(() => {
    void loadData()
  }, [gymId])

  useEffect(() => {
    if (isLoading || gymId !== undefined || !navigator.geolocation) return

    void requestCurrentLocation(false)
  }, [gymId, isLoading])

  function requestCurrentLocation(overwrite: boolean) {
    if (!navigator.geolocation) {
      setLocationMessage('Device location is unavailable. Enter coordinates manually.')
      return
    }

    setLocationMessage('Getting device location...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((previous) => ({
          ...previous,
          coordinates: overwrite || !previous.coordinates
            ? formatCoordinates(position.coords.latitude, position.coords.longitude)
            : previous.coordinates,
        }))
        setLocationMessage('Coordinates filled from device location.')
      },
      () => {
        setLocationMessage('Device location unavailable. Enter coordinates manually.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  const canSave = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.abbreviation.trim().length > 0 &&
      form.coordinates.trim().length > 0
    )
  }, [form])

  async function loadData() {
    const allGyms = await listGyms()
    setExistingGyms(allGyms)

    if (!gymId) {
      setForm(EMPTY_FORM)
      setIsLoading(false)
      return
    }

    const gym = await getGym(gymId)
    if (!gym) {
      setError('Gym not found')
      setIsLoading(false)
      return
    }

    setForm({
      name: gym.name,
      abbreviation: gym.abbreviation,
      coordinates: formatCoordinates(gym.latitude, gym.longitude),
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

    const parsed = parseCoordinates(form.coordinates)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }

    if (gymId) {
      await updateGym(gymId, {
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

      await createGym({
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
        {locationMessage && <p className="gym-editor-location">{locationMessage}</p>}

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
            placeholder="N 50° 20.935 E 014° 49.149"
            value={form.coordinates}
            onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
          />
          {gymId !== undefined && (
            <button
              className="gym-editor-action gym-editor-location-button"
              type="button"
              onClick={() => requestCurrentLocation(true)}
            >
              Use Current Location
            </button>
          )}
          <button className="gym-editor-add" onClick={saveGym} disabled={!canSave}>
            {gymId ? 'Save Gym' : 'Create Gym'}
          </button>
        </div>
      </div>
    </div>
  )
}
