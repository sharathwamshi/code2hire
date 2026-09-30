import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutGrid, FileText, Users, Settings, ChevronLeft, ChevronRight, LogOut, Video } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../../components/NotificationBell'
import './AdminLayout.css'

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/admin/jds', label: 'Job descriptions', icon: FileText },
  { to: '/admin/users', label: 'Candidates', icon: Users },
  { to: '/admin/interview-sessions', label: 'Interviews', icon: Video },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()

  return (
    <div className={`admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <span className="admin-brand">{collapsed ? 'C2H' : 'Code2Hire'}</span>
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle menu">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav className="admin-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          {!collapsed && (
            <div className="admin-user-chip">
              <div className="avatar">{(user?.full_name || user?.username || 'A').slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="admin-user-name">{user?.full_name || user?.username}</div>
                <div className="admin-user-role">Administrator</div>
              </div>
            </div>
          )}
          <button className="logout-btn" onClick={logout}><LogOut size={16} /> {!collapsed && 'Sign out'}</button>
        </div>
      </aside>
      <main className="admin-main" style={{ position: 'relative' }}>
        <div className="admin-topbar-actions"><NotificationBell /></div>
        <Outlet />
      </main>
    </div>
  )
}
