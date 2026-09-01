import { useLocation } from 'react-router-dom'
import ExerciseSelector from '../components/exercise/ExerciseSelector'

export default function ExerciseSelectionPage() {
  const location = useLocation()
  const workoutId: number | undefined = location.state?.workoutId
  const currentExerciseId: number | undefined = location.state?.currentExerciseId
  return <ExerciseSelector workoutId={workoutId} currentExerciseId={currentExerciseId} />
}
