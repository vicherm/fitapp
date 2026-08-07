import { useParams } from 'react-router-dom'
import GymEditor from '../components/gym/GymEditor'

export default function GymEditorPage() {
  const params = useParams<{ id?: string }>()
  const gymId = params.id ? Number.parseInt(params.id, 10) : undefined

  return <GymEditor gymId={Number.isFinite(gymId) ? gymId : undefined} />
}