import { useLocation } from 'react-router-dom'
import ExerciseSelector from '../components/exercise/ExerciseSelector'

interface SetCorrection {
  sourceExerciseId: string
  workoutId: string
  setId: string
}

export default function ExerciseSelectionPage() {
  const location = useLocation()
  const workoutId: string | undefined = location.state?.workoutId
  const currentExerciseId: string | undefined = location.state?.currentExerciseId
  const correction: SetCorrection | undefined = location.state?.correction
  return <ExerciseSelector workoutId={workoutId} currentExerciseId={currentExerciseId} correction={correction} />
}
