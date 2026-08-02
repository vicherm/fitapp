import { useParams } from 'react-router-dom'
import ExerciseEditor from '../components/exercise/ExerciseEditor'

export default function ExerciseEditorPage() {
  const { id } = useParams<{ id: string }>()
  return <ExerciseEditor exerciseId={id ? Number(id) : undefined} />
}
