import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { syncData } from '../data/sync'
import { getLocalDatabase, type LastSync } from '../db/local'
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
]

export default function HomePage() {
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const busy = useRef(false)
  const [lastSync, setLastSync] = useState<LastSync | null>(null)

  useEffect(() => {
    const db = getLocalDatabase()
    const subscription = liveQuery(() => db.lastSyncMetadata().get('last_sync')).subscribe({
      next: (record) => setLastSync(record ?? null),
      error: (error: unknown) => setSyncError(`Unable to read last sync: ${error instanceof Error ? error.message : String(error)}`),
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSync() {
    if (busy.current) return
    busy.current = true
    setSyncing(true)
    setSyncMessage('')
    setSyncError('')
    try {
      const result = await syncData()
      setSyncMessage(`Sync complete: ${result.records} row operations processed. ${result.keptLocal} newer local records remain pending.`)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed. Local changes have been retained.')
    } finally {
      busy.current = false
      setSyncing(false)
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
        <p className={`home-last-sync${lastSync?.status === 'BAD' ? ' home-sync-error' : ''}`} role="status">
          {lastSync
            ? `Last sync: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(lastSync.timestamp))} — ${lastSync.status}`
            : 'Last sync: Never'}
        </p>
      </section>

      <section className="home-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link key={item.to} className="home-nav-card" to={item.to}>
            {item.title}
          </Link>
        ))}
        <div className="home-actions">
          <button className="home-data-btn" type="button" disabled={syncing} onClick={() => void handleSync()}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <Link className="home-nav-card" to="/more">More ...</Link>
        </div>
      </section>

      {(syncMessage || syncError) && <section className="home-sync" aria-label="Synchronization result">
        {syncMessage && <p className="home-data-message" role="status">{syncMessage}</p>}
        {syncError && <p className="home-sync-error" role="alert">{syncError}</p>}
      </section>}

    </main>
  )
}
