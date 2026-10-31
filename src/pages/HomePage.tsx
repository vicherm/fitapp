import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { syncData } from '../data/sync'
import './HomePage.css'

const navItems = [
  {
    title: 'Active Workout',
    to: '/',
  },
  {
    title: 'History',
    to: '/history',
  },
  {
    title: 'Statistics',
    to: '/statistics',
  },
  {
    title: 'More ...',
    to: '/more',
  },
]

export default function HomePage() {
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const busy = useRef(false)

  async function handleSync(direction: 'push' | 'pull') {
    if (busy.current) return
    busy.current = true
    setSyncing(direction)
    setSyncMessage('')
    setSyncError('')
    try {
      const result = await syncData(direction)
      setSyncMessage(`${direction === 'push' ? 'Push' : 'Pull'} complete: ${result.records} records synchronized. ${result.keptLocal} newer local records kept.`)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed. Local changes have been retained.')
    } finally {
      busy.current = false
      setSyncing(null)
    }
  }
  const logoUrl = `${import.meta.env.BASE_URL}icons/icon-512.png`
  const buildDate = new Date(import.meta.env.VITE_BUILD_TIMESTAMP)
  const buildTimestamp = Number.isNaN(buildDate.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(buildDate)

  return (
    <main className="home-page">
      <section className="home-hero" aria-label="GymLog overview">
        <img className="home-logo" src={logoUrl} alt="GymLog logo" />
        <p className="home-build" aria-label={`Build date and time: ${buildTimestamp}`}>
          Built {buildTimestamp}
        </p>
      </section>

      <section className="home-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link key={item.to} className="home-nav-card" to={item.to}>
            {item.title}
          </Link>
        ))}
      </section>

      <section className="home-sync" aria-label="Temporary manual synchronization">
        <p>Data is stored on this device. Push and Pull are manual only.</p>
        <div className="home-sync-buttons">
          <button className="home-data-btn" type="button" disabled={syncing !== null} onClick={() => void handleSync('push')}>
            {syncing === 'push' ? 'Pushing...' : 'Push'}
          </button>
          <button className="home-data-btn" type="button" disabled={syncing !== null} onClick={() => void handleSync('pull')}>
            {syncing === 'pull' ? 'Pulling...' : 'Pull'}
          </button>
        </div>
        <p>On first use, press Pull to load your server data. Conflicts use the latest updated_at; equal timestamps favor the server.</p>
        {syncMessage && <p className="home-data-message" role="status">{syncMessage}</p>}
        {syncError && <p className="home-sync-error" role="alert">{syncError}</p>}
      </section>

    </main>
  )
}
