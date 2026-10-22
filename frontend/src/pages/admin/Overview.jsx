import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client'
import '../../styles/shared.css'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Overview() {
  const [stats, setStats] = useState(null)
  const [jds, setJds] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => {
    client.get('/admin/overview').then((r) => setStats(r.data))
    client.get('/admin/jds').then((r) => setJds(r.data.slice(0, 5)))
    client.get('/admin/users').then((r) => setUsers(r.data.slice(0, 5)))
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Admin</span>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">A quick read on how the roster is progressing across your open roles.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin/jds" className="btn btn-outline">Add a JD</Link>
          <Link to="/admin/users" className="btn btn-violet">Add a candidate</Link>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">Candidates</span><span className="stat-value">{stats?.total_candidates ?? '—'}</span></div>
        <div className="stat-card"><span className="stat-label">Job descriptions</span><span className="stat-value">{stats?.total_jds ?? '—'}</span></div>
        <div className="stat-card"><span className="stat-label">Total sign-ins</span><span className="stat-value">{stats?.total_logins ?? '—'}</span></div>
        <div className="stat-card"><span className="stat-label">Total prep time</span><span className="stat-value">{stats ? formatDuration(stats.total_time_seconds) : '—'}</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3>Recent job descriptions</h3>
            <Link to="/admin/jds" style={{ fontSize: 13, color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>
          {jds.length === 0 && <p style={{ fontSize: 13.5 }}>No job descriptions yet.</p>}
          {jds.map((jd) => (
            <div key={jd.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{jd.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{jd.company || 'General'} · {jd.assigned_count} assigned</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3>Recently added candidates</h3>
            <Link to="/admin/users" style={{ fontSize: 13, color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>
          {users.length === 0 && <p style={{ fontSize: 13.5 }}>No candidates yet.</p>}
          {users.map((u) => (
            <div key={u.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{u.full_name || u.username}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{u.jd_title || 'No JD assigned'} · {u.login_count} logins</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
