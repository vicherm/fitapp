import { type ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportAllDataToJson, importAllDataFromJson } from '../db/backup'
import './HomePage.css'

const navItems = [
  {
    title: 'Active Workout',
    to: '/',
  },
  {
    title: 'Body Part Editor',
    to: '/body-part-groups',
  },
  {
    title: 'Exercise Editor',
    to: '/exercises/new',
  },
]

export default function HomePage() {
  const logoUrl = `${import.meta.env.BASE_URL}icons/icon-512.png`
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')

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

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleImportSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isBusy) return

    const confirmed = window.confirm('Import will replace all local data. Continue?')
    if (!confirmed) return

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

  return (
    <main className="home-page">
      <section className="home-hero" aria-label="GymLog overview">
        <img className="home-logo" src={logoUrl} alt="GymLog logo" />
      </section>

      <section className="home-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link key={item.to} className="home-nav-card" to={item.to}>
            {item.title}
          </Link>
        ))}
      </section>

      <section className="home-data" aria-label="Data backup">
        <button className="home-data-btn" onClick={handleExport} disabled={isBusy}>
          Export JSON
        </button>
        <button className="home-data-btn" onClick={handleImportClick} disabled={isBusy}>
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
    </main>
  )
}
