import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import client from '../api/client'
import { mustUseDesktop } from '../utils/device'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // A desktop-only account that is already signed in on this phone/tablet (e.g. a saved
  // session) is signed out and shown the "use a computer" message instead of the app.
  const [mobileBlocked, setMobileBlocked] = useState(() => {
    try { const raw = localStorage.getItem('am_user'); return !!raw && mustUseDesktop(JSON.parse(raw).role) } catch (e) { return false }
  })
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('am_user')
    if (!raw) return null
    try { const u = JSON.parse(raw); return mustUseDesktop(u.role) ? null : u } catch (e) { return null }
  })
  const [loading, setLoading] = useState(false)
  const heartbeatRef = useRef(null)

  // `expectedRole` is the door the person picked on the sign-in dialog ('candidate' or 'admin').
  // Right credentials at the wrong door sign nobody in; the dialog moves them to the right tab.
  const login = useCallback(async (username, password, expectedRole) => {
    setLoading(true)
    try {
      const { data } = await client.post('/auth/login', { username, password })
      if (expectedRole && data.user?.role !== expectedRole) {
        client.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${data.token}` } }).catch(() => {})
        const wrong = new Error('wrong_portal')
        wrong.code = 'wrong_portal'
        wrong.actualRole = data.user?.role
        throw wrong
      }
      if (mustUseDesktop(data.user?.role)) {
        // Correct credentials, wrong device: end the session we just opened, keep nothing,
        // and let the app show only the "use a computer" message.
        client.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${data.token}` } }).catch(() => {})
        setMobileBlocked(true)
        return data.user
      }
      localStorage.setItem('am_token', data.token)
      localStorage.setItem('am_user', JSON.stringify(data.user))
      localStorage.setItem('am_session_id', String(data.session_id))
      setUser(data.user)
      return data.user
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try { await client.post('/auth/logout') } catch (e) { /* ignore */ }
    localStorage.removeItem('am_token')
    localStorage.removeItem('am_user')
    localStorage.removeItem('am_session_id')
    setUser(null)
    window.location.href = '/'
  }, [])

  const refreshMe = useCallback(async () => {
    const { data } = await client.get('/auth/me')
    localStorage.setItem('am_user', JSON.stringify(data))
    setUser(data)
    return data
  }, [])

  useEffect(() => {
    if (!mobileBlocked) return
    // Clear any saved session left over from before (best effort on the server side).
    const saved = localStorage.getItem('am_token')
    if (saved) client.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${saved}` } }).catch(() => {})
    localStorage.removeItem('am_token'); localStorage.removeItem('am_user'); localStorage.removeItem('am_session_id')
  }, [mobileBlocked])

  useEffect(() => {
    if (!user) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      const session_id = localStorage.getItem('am_session_id')
      client.post('/auth/heartbeat', { session_id }).catch(() => {})
    }
    heartbeatRef.current = setInterval(tick, 30000)
    return () => clearInterval(heartbeatRef.current)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, refreshMe, loading, mobileBlocked }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
