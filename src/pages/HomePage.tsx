import { Link } from 'react-router-dom'
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
    title: 'More ...',
    to: '/more',
  },
]

export default function HomePage() {
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

    </main>
  )
}
