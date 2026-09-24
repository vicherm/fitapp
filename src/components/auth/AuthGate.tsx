import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import './AuthGate.css'

const ALLOWED_EMAIL = 'miroslav.vicher@gmail.com'

interface Props {
  children: ReactNode
}

function isAllowedSession(session: Session): boolean {
  return session.user.email?.toLowerCase() === ALLOWED_EMAIL
    && session.user.app_metadata.provider === 'google'
}

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deniedAccount, setDeniedAccount] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isActive) return
      setSession(data.session)
      setError(sessionError?.message ?? null)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) return
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || isAllowedSession(session)) return

    setDeniedAccount(session.user.email ?? 'Unknown account')
    void supabase.auth.signOut()
  }, [session])

  async function signInWithGoogle() {
    setDeniedAccount(null)
    setError(null)

    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })

    if (signInError) setError(signInError.message)
  }

  if (isLoading) {
    return <div className="auth-loading">Loading…</div>
  }

  if (session && isAllowedSession(session)) return children

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="auth-kicker">Personal training log</p>
        <h1 id="auth-title">GymLog</h1>
        <button className="auth-google-button" type="button" onClick={() => void signInWithGoogle()}>
          <span className="auth-google-mark" aria-hidden="true">G</span>
          Continue with Google
        </button>
        {deniedAccount && (
          <p className="auth-error" role="alert">Access is not permitted for {deniedAccount}.</p>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}