import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NodeGraphBackdrop from '../components/NodeGraphBackdrop'
import './LoginPage.css'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const user = await login(username, password)
      navigate(user.role === 'admin' ? '/admin' : '/app')
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not sign in. Check your username and password.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-visual">
        <NodeGraphBackdrop nodeCount={40} />
        <div className="login-visual-copy">
          <span className="brand-mark">AcknowledgerMate</span>
          <h1>Know the question before it's asked.</h1>
          <p>Every prep session maps your resume against the role's requirements, branch by branch, so you walk in already knowing how the conversation will move.</p>
        </div>
      </div>
      <div className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <span className="eyebrow">Sign in</span>
          <h2>Welcome back</h2>
          <p className="subtle">Use the username and password shared by your admin.</p>
          <label className="field"><span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. priya.s" autoComplete="username" required />
          </label>
          <label className="field"><span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  )
}
