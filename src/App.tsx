import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ActiveWorkoutPage from './pages/ActiveWorkoutPage'
import ExerciseSelectionPage from './pages/ExerciseSelectionPage'
import ExerciseEditorPage from './pages/ExerciseEditorPage'
import BodyPartGroupEditorPage from './pages/BodyPartGroupEditorPage'
import HomePage from './pages/HomePage'
import ExerciseHistoryPage from './pages/ExerciseHistoryPage'
import ExerciseManagementPage from './pages/ExerciseManagementPage'
import GymsPage from './pages/GymsPage'
import GymEditorPage from './pages/GymEditorPage'
import WorkoutHistoryPage from './pages/WorkoutHistoryPage'
import WorkoutSummaryPage from './pages/WorkoutSummaryPage'
import MorePage from './pages/MorePage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<ActiveWorkoutPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<WorkoutHistoryPage />} />
        <Route path="/history/:id" element={<WorkoutSummaryPage />} />
        <Route path="/exercise-management" element={<ExerciseManagementPage />} />
        <Route path="/exercises" element={<ExerciseSelectionPage />} />
        <Route path="/exercises/:id" element={<ExerciseHistoryPage />} />
        <Route path="/exercises/:id/history" element={<ExerciseHistoryPage />} />
        <Route path="/exercises/create" element={<ExerciseEditorPage />} />
        <Route path="/exercises/new" element={<ExerciseEditorPage />} />
        <Route path="/exercises/:id/edit" element={<ExerciseHistoryPage />} />
        <Route path="/body-part-groups" element={<BodyPartGroupEditorPage />} />
        <Route path="/gyms" element={<GymsPage />} />
        <Route path="/gyms/create" element={<GymEditorPage />} />
        <Route path="/gyms/:id/edit" element={<GymEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
