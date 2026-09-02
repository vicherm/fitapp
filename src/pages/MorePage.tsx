import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportAllDataToJson, importAllDataFromJson } from '../db/backup'
import { db } from '../db/db'
import './HomePage.css'
import './MorePage.css'

const moreItems = [
  { title: 'Body Part Groups', to: '/body-part-groups' },
  { title: 'Exercises', to: '/exercise-management' },
  { title: 'Gyms', to: '/gyms' },
]

export default function MorePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [resetRequested, setResetRequested] = useState(false)
  const [resetCountdown, setResetCountdown] = useState(5)

  useEffect(() => {
    if (!resetRequested || resetCountdown <= 0) return

    const timer = window.setTimeout(() => setResetCountdown((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resetRequested, resetCountdown])

  async function handleExport() {
    setIsBusy(true)
    setMessage('')
    try {
      await exportAllDataToJson()
      setMessage('Exported backup JSON file.')
    } catch {
      setMessage('Export failed. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleImportSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isBusy) return

    if (!window.confirm('Import will replace all local data. Continue?')) return

    setIsBusy(true)
    setMessage('')
    try {
      const result = await importAllDataFromJson(file)
      setMessage(`Imported ${result.records} records. Reloading...`)
      window.setTimeout(() => window.location.reload(), 500)
    } catch {
      setMessage('Import failed. Please select a valid backup JSON file.')
      setIsBusy(false)
    }
  }

  function requestReset() {
    setMessage('')
    setResetCountdown(5)
    setResetRequested(true)
  }

  async function confirmReset() {
    if (resetCountdown > 0 || isBusy) return

    setIsBusy(true)
    try {
      await db.transaction(
        'rw',
        [
          db.settings,
          db.bodyPartGroups,
          db.exercises,
          db.gyms,
          db.workouts,
          db.workoutExercises,
          db.workoutSets,
        ],
        async () => {
          await db.workoutSets.clear()
          await db.workoutExercises.clear()
          await db.workouts.clear()
          await db.exercises.clear()
          await db.bodyPartGroups.clear()
          await db.gyms.clear()
          await db.settings.clear()
        },
      )
      sessionStorage.removeItem('gymlog-active-workout-draft-v1')
      window.location.reload()
    } catch {
      setMessage('Reset failed. Please try again.')
      setResetRequested(false)
      setIsBusy(false)
    }
  }

  return (
    <main className="more-page">
      <header className="more-header">
        <Link className="more-back" to="/home" aria-label="Back to Home">
          ←
        </Link>
        <h1>More</h1>
      </header>

      <section className="home-nav" aria-label="Additional navigation">
        {moreItems.map((item) => (
          <Link key={item.to} className="home-nav-card" to={item.to}>
            {item.title}
          </Link>
        ))}
      </section>

      <section className="home-data" aria-label="Data backup">
        <button className="home-data-btn" onClick={handleExport} disabled={isBusy}>
          Export JSON
        </button>
        <button className="home-data-btn" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          className="home-data-input"
          type="file"
          accept="application/json,.json"
          onChange={handleImportSelected}
        />
        {message && <p className="home-data-message">{message}</p>}
      </section>

      <section className="more-danger" aria-label="Delete all data">
        {!resetRequested ? (
          <button className="more-reset-btn" onClick={requestReset} disabled={isBusy}>
            Reset All Data
          </button>
        ) : (
          <div className="more-reset-confirmation">
            <p>This permanently deletes all workouts, exercises, gyms, groups, and settings.</p>
            <button
              className="more-reset-btn"
              onClick={() => void confirmReset()}
              disabled={resetCountdown > 0 || isBusy}
            >
              {resetCountdown > 0 ? `Confirm Reset (${resetCountdown})` : 'Confirm Reset'}
            </button>
            <button
              className="more-cancel-btn"
              onClick={() => setResetRequested(false)}
              disabled={isBusy}
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
