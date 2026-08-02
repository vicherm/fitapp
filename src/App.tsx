import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ActiveWorkoutPage from './pages/ActiveWorkoutPage'
import ExerciseSelectionPage from './pages/ExerciseSelectionPage'
import ExerciseEditorPage from './pages/ExerciseEditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ActiveWorkoutPage />} />
        <Route path="/exercises" element={<ExerciseSelectionPage />} />
        <Route path="/exercises/new" element={<ExerciseEditorPage />} />
        <Route path="/exercises/:id/edit" element={<ExerciseEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
