import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutGrid, Briefcase, Users, Settings, ChevronLeft, ChevronRight, LogOut, Search, Menu, X } from 'lucide-react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../../components/NotificationBell'
import SearchPalette from '../../components/SearchPalette'
import { AdminUiProvider, useAdminUi } from '../../components/AdminUi'
import './AdminLayout.css'
import '../../styles/hub.css'
import '../../styles/admin-mobile.css'

const NAV = [
  { to: '/admin', label: 'Home', icon: LayoutGrid, end: true, badge: true },
  { to: '/admin/roles', label: 'Roles', icon: Briefcase },
  { to: '/admin/users', label: 'Candidates', icon: Users },
]

// True while the viewport is narrow enough that the sidebar becomes a slide-out drawer.
function useIsNarrow(maxWidth = 900) {
  const query = `(max-width: ${maxWidth}px)`
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [narrow, setNarrow] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on) }
  }, [query])
  return narrow
}

function Shell() {
  const [collapsedPref, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const narrow = useIsNarrow()
  const location = useLocation()
  // In drawer mode the menu is always shown in full; "collapsed" only applies to the desktop rail.
  const collapsed = collapsedPref && !narrow
  const [searchOpen, setSearchOpen] = useState(false)
  const [badge, setBadge] = useState(0)
  const { user, logout } = useAuth()
  const { version } = useAdminUi()

  // The drawer closes whenever you navigate, when the screen widens, and on Escape.
  useEffect(() => { setDrawerOpen(false) }, [location.pathname, location.search])
  useEffect(() => { if (!narrow) setDrawerOpen(false) }, [narrow])
  useEffect(() => {
    if (!drawerOpen) return
    const onEsc = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [drawerOpen])

  // Ctrl/Cmd+K or "/" (when not typing in a field) opens the universal search.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // How many things are waiting on a human (reports to review, questions to approve, reviewed-not-shared).
  const loadBadge = useCallback(() => {
    client.get('/admin/home').then((r) => setBadge(r.data?.counts?.needs_attention || 0)).catch(() => {})
  }, [])
  useEffect(() => {
    loadBadge()
    const t = setInterval(loadBadge, 60000)
    return () => clearInterval(t)
  }, [loadBadge, version])

  return (
    <div className={`admin-shell ${collapsed ? 'is-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {drawerOpen && <div className="admin-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside className="admin-sidebar" id="admin-sidebar" aria-label="Main menu">
        <div className="admin-sidebar-top">
          <span className="admin-brand">{collapsed ? 'C2H' : 'Code2Hire'}</span>
          <button className="collapse-btn collapse-desktop" onClick={() => setCollapsed((c) => !c)} aria-label="Collapse menu">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button className="collapse-btn close-mobile" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <nav className="admin-nav">
          {NAV.map(({ to, label, icon: Icon, end, badge: hasBadge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
              {hasBadge && badge > 0 && <span className="nav-badge" title={`${badge} waiting on you`}>{badge > 99 ? '99+' : badge}</span>}
            </NavLink>
          ))}
          <NavLink to="/admin/settings" className={({ isActive }) => `admin-nav-link sub ${isActive ? 'active' : ''}`}>
            <Settings size={18} />{!collapsed && <span>Settings</span>}
          </NavLink>
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
      <main className="admin-main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="admin-sidebar">
            <Menu size={20} />{badge > 0 && <span className="menu-dot" aria-hidden="true" />}
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Open search">
            <Search size={16} /> <span className="search-text">Search roles, skills, candidates...</span><kbd>Ctrl K</kbd>
          </button>
          <NotificationBell />
        </div>
        <Outlet />
      </main>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

export default function AdminLayout() {
  return (
    <AdminUiProvider>
      <Shell />
    </AdminUiProvider>
  )
}
