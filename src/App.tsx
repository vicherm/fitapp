import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ActiveWorkoutPage from './pages/ActiveWorkoutPage'
import ExerciseSelectionPage from './pages/ExerciseSelectionPage'
import ExerciseEditorPage from './pages/ExerciseEditorPage'
import BodyPartGroupEditorPage from './pages/BodyPartGroupEditorPage'
import HomePage from './pages/HomePage'
import ExerciseHistoryPage from './pages/ExerciseHistoryPage'
import ExerciseManagementPage from './pages/ExerciseManagementPage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<ActiveWorkoutPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/exercise-management" element={<ExerciseManagementPage />} />
        <Route path="/exercises" element={<ExerciseSelectionPage />} />
        <Route path="/exercises/:id" element={<ExerciseHistoryPage />} />
        <Route path="/exercises/:id/history" element={<ExerciseHistoryPage />} />
        <Route path="/exercises/create" element={<ExerciseEditorPage />} />
        <Route path="/exercises/new" element={<ExerciseEditorPage />} />
        <Route path="/exercises/:id/edit" element={<ExerciseHistoryPage />} />
        <Route path="/body-part-groups" element={<BodyPartGroupEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
