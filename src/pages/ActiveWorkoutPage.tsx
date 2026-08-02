import { useLocation } from 'react-router-dom'
import ActiveWorkout from '../components/workout/ActiveWorkout'
import useWorkout from '../hooks/useWorkout'
import type { Exercise } from '../db/types'

export default function ActiveWorkoutPage() {
  const workout = useWorkout()
  const location = useLocation()
  const pendingExercise: Exercise | undefined = location.state?.selectedExercise
  return <ActiveWorkout workout={workout} pendingExercise={pendingExercise} />
}
