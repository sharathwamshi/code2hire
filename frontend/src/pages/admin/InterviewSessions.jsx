import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Play, RotateCcw, PauseCircle, Eye } from 'lucide-react'
import client from '../../api/client'
import '../../styles/shared.css'

const STATUS_LABEL = {
  not_started: 'Not started', in_progress: 'In progress', paused: 'Paused',
  completed: 'Completed', restarted: 'Restarted', abandoned: 'Abandoned',
}
const STATUS_BADGE = {
  not_started: 'badge-notstarted', in_progress: 'badge-inprogress',
  paused: 'badge-paused', completed: 'badge-completed', restarted: 'badge-notstarted', abandoned: 'badge-notstarted',
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function describeError(err, fallbackVerb) {
  if (!err?.response) {
    return `Could not reach the server to ${fallbackVerb} this session. Check that the backend is running and reachable (network error, or blocked by CORS).`
  }
  const { status, data } = err.response
  if (data && typeof data === 'object' && data.error) {
    return data.error
  }
  const bodyPreview = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)
  return `Server responded with ${status} while trying to ${fallbackVerb} this session, but sent no error details. Raw response: ${bodyPreview || '(empty)'}`
}

export default function InterviewSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [actingId, setActingId] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    const url = filter ? `/admin/interview-sessions?status=${filter}` : '/admin/interview-sessions'
    client.get(url).then((r) => setSessions(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [filter])
  useEffect(() => {
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [filter])

  const resume = async (id) => {
    setActingId(id); setError('')
    try {
      await client.post(`/admin/interview-sessions/${id}/resume`)
    } catch (err) {
      const msg = describeError(err, 'resume')
      setError(msg.includes('not paused') ? `Already up to date: ${msg} (the list was likely just stale — refreshed now.)` : msg)
    } finally {
      load()
      setActingId(null)
    }
  }

  const restart = async (id) => {
    if (!confirm('Restart this interview? The current Q&A will be discarded and a fresh interview will begin.')) return
    setActingId(id); setError('')
    try {
      await client.post(`/admin/interview-sessions/${id}/restart`)
    } catch (err) {
      setError(describeError(err, 'restart'))
    } finally {
      load()
      setActingId(null)
    }
  }

  const manualPause = async (id) => {
    setActingId(id); setError('')
    try {
      await client.post(`/admin/interview-sessions/${id}/manual-pause`)
    } catch (err) {
      setError(describeError(err, 'pause'))
    } finally {
      load()
      setActingId(null)
    }
  }

  const pausedCount = sessions.filter((s) => s.status === 'paused').length
  const inProgressCount = sessions.filter((s) => s.status === 'in_progress').length

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Admin</span>
          <h1 className="page-title">Interview sessions</h1>
          <p className="page-subtitle">Live view of every AI-conducted and live interview — pause, resume, or restart at any point. Only admins can resume a paused interview.</p>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">In progress</span><span className="stat-value">{inProgressCount}</span></div>
        <div className="stat-card"><span className="stat-label">Paused (needs review)</span><span className="stat-value" style={{ color: pausedCount > 0 ? 'var(--red)' : undefined }}>{pausedCount}</span></div>
        <div className="stat-card"><span className="stat-label">Total sessions</span><span className="stat-value">{sessions.length}</span></div>
      </div>

      <div className="toolbar">
        {['', 'in_progress', 'paused', 'completed', 'not_started'].map((s) => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-violet' : 'btn-outline'}`} onClick={() => setFilter(s)}>
            {s === '' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <p style={{ padding: 22 }}>Loading…</p> : sessions.length === 0 ? (
          <div className="empty-state"><h3>No interview sessions yet</h3><p>Sessions appear here once a candidate starts an AI or live interview.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Candidate</th><th>Role</th><th>Mode</th><th>Status</th><th>Violations</th><th>Started</th><th></th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/admin/interview-sessions/${s.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>{s.candidate_name}</Link></td>
                  <td style={{ fontSize: 12.5 }}>{s.jd_title}</td>
                  <td><span className="badge badge-neutral">{s.mode === 'ai' ? 'AI interview' : 'Live call'}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
                  <td>
                    {s.violation_count > 0 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>
                        <AlertTriangle size={14} /> {s.violation_count}
                      </span>
                    ) : <span style={{ color: 'var(--ink-faint)' }}>0</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{timeAgo(s.started_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link to={`/admin/interview-sessions/${s.id}`} className="icon-btn"><Eye size={16} /></Link>
                      {s.status === 'paused' && (
                        <button className="icon-btn" onClick={() => resume(s.id)} disabled={actingId === s.id} title="Resume"><Play size={16} color="var(--green)" /></button>
                      )}
                      {s.status === 'in_progress' && (
                        <button className="icon-btn" onClick={() => manualPause(s.id)} disabled={actingId === s.id} title="Pause"><PauseCircle size={16} /></button>
                      )}
                      {(s.status === 'paused' || s.status === 'completed') && (
                        <button className="icon-btn" onClick={() => restart(s.id)} disabled={actingId === s.id} title="Restart"><RotateCcw size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
