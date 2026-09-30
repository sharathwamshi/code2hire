import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('am_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const heartbeatRef = useRef(null)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      const { data } = await client.post('/auth/login', { username, password })
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
    <AuthContext.Provider value={{ user, setUser, login, logout, refreshMe, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
