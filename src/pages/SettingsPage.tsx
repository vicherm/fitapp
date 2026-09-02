import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Settings } from '../db/types'
import './SettingsPage.css'

const DEFAULT_RADIUS = 200

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void db.settings.orderBy('id').first().then((savedSettings) => {
      if (!savedSettings) return
      setSettings(savedSettings)
      setRadius(String(savedSettings.gymDetectionRadius))
    })
  }, [])

  async function saveSettings() {
    const parsedRadius = Number(radius)
    if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
      setError('Detection radius must be a positive number of metres')
      setMessage('')
      return
    }

    const nextSettings = { gymDetectionRadius: parsedRadius, theme: 'dark' as const }
    if (settings?.id) {
      await db.settings.update(settings.id, nextSettings)
      setSettings({ ...settings, ...nextSettings })
    } else {
      const id = await db.settings.add(nextSettings)
      setSettings({ ...nextSettings, id })
    }

    setError('')
    setMessage('Settings saved.')
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link className="settings-back" to="/more" aria-label="Back to More">
          ←
        </Link>
        <h1>Settings</h1>
      </header>

      <section className="settings-card" aria-label="Gym detection settings">
        <label className="settings-label">
          Global gym detection radius
          <span className="settings-field-row">
            <input
              className="settings-input"
              type="number"
              min="1"
              step="1"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
              aria-label="Global gym detection radius in metres"
            />
            <span>metres</span>
          </span>
        </label>
        <button className="settings-save" onClick={() => void saveSettings()}>
          Save Settings
        </button>
        {error && <p className="settings-error">{error}</p>}
        {message && <p className="settings-message">{message}</p>}
      </section>
    </main>
  )
}
