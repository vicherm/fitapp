import { useEffect, useState, type ReactNode } from 'react'
import { closePreviousDayWorkouts } from '../../data/workouts'
import { automaticSync } from '../../data/sync'
import { getLocalDatabase } from '../../db/local'

export default function SyncCoordinator({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const db = getLocalDatabase()
    let active = true
    let running = false
    let pending = false
    async function run() {
      if (!active || document.visibilityState !== 'visible') return
      if (running) { pending = true; return }
      running = true
      try {
        setError('')
        await closePreviousDayWorkouts()
        if (!active) return
        setReady(true)
        if (document.visibilityState === 'visible') await automaticSync(db)
      } catch (failure) {
        if (active) setError(`Automatic sync/workout closure failed. Retry Sync on Home. ${failure instanceof Error ? failure.message : String(failure)}`)
      } finally {
        running = false
        if (active) setReady(true)
        if (pending && active) {
          pending = false
          void run()
        }
      }
    }
    function onVisible() { void run() }
    document.addEventListener('visibilitychange', onVisible)
    void run()
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return <>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {ready ? children : <div className="auth-loading">Preparing workouts...</div>}
  </>
}
