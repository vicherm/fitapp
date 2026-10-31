import { useParams } from 'react-router-dom'
import GymEditor from '../components/gym/GymEditor'

export default function GymEditorPage() {
  const params = useParams<{ id?: string }>()
  const gymId = params.id

  return <GymEditor gymId={gymId} />
}