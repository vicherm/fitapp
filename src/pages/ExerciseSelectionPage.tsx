import { useLocation } from 'react-router-dom'
import ExerciseSelector from '../components/exercise/ExerciseSelector'

interface SetCorrection {
  sourceExerciseId: number
  workoutId: number
  setId: number
}

export default function ExerciseSelectionPage() {
  const location = useLocation()
  const workoutId: number | undefined = location.state?.workoutId
  const currentExerciseId: number | undefined = location.state?.currentExerciseId
  const correction: SetCorrection | undefined = location.state?.correction
  return <ExerciseSelector workoutId={workoutId} currentExerciseId={currentExerciseId} correction={correction} />
}
