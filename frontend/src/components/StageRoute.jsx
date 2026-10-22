import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function StageRoute({ stage, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'candidate') return <Navigate to="/admin" replace />
  if (user.active_stage !== stage) return <Navigate to="/app" replace />
  return children
}
