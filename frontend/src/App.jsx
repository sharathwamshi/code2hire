import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import StageRoute from './components/StageRoute'
import DesktopOnly from './components/DesktopOnly'

import LandingPage from './pages/LandingPage'

import AdminLayout from './pages/admin/AdminLayout'
import Home from './pages/admin/Home'
import Roles from './pages/admin/Roles'
import RoleDetail from './pages/admin/RoleDetail'
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

// Remount the detail pages when the id in the URL changes, so one person's data is never
// shown under another person's name while the next one loads.
function KeyedUserDetail() { const { id } = useParams(); return <UserDetail key={id} /> }
function KeyedRoleDetail() { const { id } = useParams(); return <RoleDetail key={id} /> }
function KeyedSessionDetail() { const { id } = useParams(); return <InterviewSessionDetail key={id} /> }

// A desktop-only account that signed in from a phone or tablet sees only the message.
function DeviceGate({ children }) {
  const { mobileBlocked } = useAuth()
  return mobileBlocked ? <DesktopOnly /> : children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DeviceGate>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="roles" element={<Roles />} />
            <Route path="roles/:id" element={<KeyedRoleDetail />} />
            <Route path="jds" element={<Navigate to="/admin/roles" replace />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<KeyedUserDetail />} />
            <Route path="interview-sessions" element={<InterviewSessions />} />
            <Route path="interview-sessions/:id" element={<KeyedSessionDetail />} />
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
        </DeviceGate>
      </AuthProvider>
    </BrowserRouter>
  )
}
