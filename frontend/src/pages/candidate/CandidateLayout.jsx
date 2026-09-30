import { NavLink, Outlet } from 'react-router-dom'
import { LayoutGrid, BookOpen, MessageSquareHeart, KeyRound, LogOut, Mic } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import './CandidateLayout.css'

export default function CandidateLayout() {
  const { user, logout } = useAuth()
  const stage = user?.active_stage || 'prepare'

  const nav = [{ to: '/app', label: 'Dashboard', icon: LayoutGrid, end: true }]
  if (stage === 'prepare') {
    nav.push({ to: '/app/prepare', label: 'Prepare', icon: BookOpen })
    nav.push({ to: '/app/feedback', label: 'Feedback', icon: MessageSquareHeart })
  } else {
    nav.push({ to: '/app/interview', label: 'Interview', icon: Mic })
  }

  return (
    <div className="cand-shell">
      <header className="cand-topbar">
        <div className="cand-topbar-left">
          <span className="cand-brand">Code2Hire</span>
          <nav className="cand-nav">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `cand-nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="cand-topbar-right">
          <NavLink to="/app/change-password" className="icon-only-link" title="Change password"><KeyRound size={17} /></NavLink>
          <div className="cand-avatar">{(user?.full_name || user?.username || 'U').slice(0, 1).toUpperCase()}</div>
          <span className="cand-username">{user?.full_name || user?.username}</span>
          <button className="cand-logout" onClick={logout} title="Sign out"><LogOut size={16} /></button>
        </div>
      </header>
      <main className="cand-main"><Outlet /></main>
    </div>
  )
}
