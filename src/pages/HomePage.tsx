import { Link } from 'react-router-dom'
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
    </main>
  )
}
