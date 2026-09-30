import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import StageRoute from './components/StageRoute'

import LandingPage from './pages/LandingPage'

import AdminLayout from './pages/admin/AdminLayout'
import Overview from './pages/admin/Overview'
import JobDescriptions from './pages/admin/JobDescriptions'
import Users from './pages/admin/Users'
import UserDetail from './pages/admin/UserDetail'
import AdminSettings from './pages/admin/AdminSettings'
import InterviewSessions from './pages/admin/InterviewSessions'
import InterviewSessionDetail from './pages/admin/InterviewSessionDetail'

import CandidateLayout from './pages/candidate/CandidateLayout'
import CandidateDashboard from './pages/candidate/CandidateDashboard'
import Prepare from './pages/candidate/Prepare'
import Feedback from './pages/candidate/Feedback'
import ChangePassword from './pages/candidate/ChangePassword'
import InterviewRoom from './pages/candidate/InterviewRoom'
import LiveInterview from './pages/candidate/LiveInterview'

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <LandingPage />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Overview />} />
            <Route path="jds" element={<JobDescriptions />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="interview-sessions" element={<InterviewSessions />} />
            <Route path="interview-sessions/:id" element={<InterviewSessionDetail />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="/app" element={<ProtectedRoute role="candidate"><CandidateLayout /></ProtectedRoute>}>
            <Route index element={<CandidateDashboard />} />
            <Route path="prepare" element={<StageRoute stage="prepare"><Prepare /></StageRoute>} />
            <Route path="feedback" element={<StageRoute stage="prepare"><Feedback /></StageRoute>} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          <Route path="/app/interview" element={<ProtectedRoute role="candidate"><StageRoute stage="interview"><InterviewRoom /></StageRoute></ProtectedRoute>} />
          <Route path="/app/interview/live/:token" element={<ProtectedRoute role="candidate"><StageRoute stage="interview"><LiveInterview /></StageRoute></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
