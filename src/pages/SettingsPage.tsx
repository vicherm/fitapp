import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_SYNC_COOLDOWN, getSettings, updateSettings } from '../data/settings'
import { supabase } from '../lib/supabase'
import './SettingsPage.css'

const DEFAULT_RADIUS = 200

export default function SettingsPage() {
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS))
  const [cooldown, setCooldown] = useState(String(DEFAULT_SYNC_COOLDOWN))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountError, setAccountError] = useState('')

  useEffect(() => {
    void getSettings().then((savedSettings) => {
      if (!savedSettings) return
      setRadius(String(savedSettings.gymDetectionRadius))
      setCooldown(String(savedSettings.syncCooldownSeconds))
    }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Unable to load settings.'))

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      setAccountEmail(data.session?.user.email ?? '')
      if (sessionError) setAccountError(sessionError.message)
    })
  }, [])

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setAccountError(signOutError.message)
  }

  async function saveSettings() {
    const parsedRadius = Number(radius)
    if (!Number.isInteger(parsedRadius) || parsedRadius <= 0) {
      setError('Detection radius must be a positive whole number of metres')
      setMessage('')
      return
    }

    const parsedCooldown = Number(cooldown)
    if (!cooldown.trim() || !Number.isInteger(parsedCooldown) || parsedCooldown < 0 || parsedCooldown > 2147483647) {
      setError('Sync cooldown must be a whole number from 0 to 2147483647 seconds.')
      setMessage('')
      return
    }
    try {
      await updateSettings({ gymDetectionRadius: parsedRadius, syncCooldownSeconds: parsedCooldown, theme: 'dark' })
      setError('')
      setMessage('Settings saved.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save settings.')
      setMessage('')
    }
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
        <label className="settings-label settings-cooldown">
          Automatic sync cooldown
          <span className="settings-field-row">
            <input className="settings-input" type="number" min="0" max="2147483647" step="1"
              value={cooldown} onChange={(event) => setCooldown(event.target.value)}
              aria-label="Automatic sync cooldown in seconds" />
            <span>seconds</span>
          </span>
        </label>
        <button className="settings-save" onClick={() => void saveSettings()}>
          Save Settings
        </button>
        {error && <p className="settings-error">{error}</p>}
        {message && <p className="settings-message">{message}</p>}
      </section>

      <section className="settings-card settings-account" aria-label="Account settings">
        <div>
          <h2>Google Account</h2>
          {accountEmail && <p>{accountEmail}</p>}
        </div>
        <button className="settings-sign-out" type="button" onClick={() => void signOut()}>
          Sign Out
        </button>
        {accountError && <p className="settings-error" role="alert">{accountError}</p>}
      </section>
    </main>
  )
}
