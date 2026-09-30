import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Trash2, Copy, Check } from 'lucide-react'
import client from '../../api/client'
import '../../styles/shared.css'

const emptyForm = { username: '', full_name: '', email: '', password: '', jd_id: '', training_level: 'medium' }

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [jds, setJds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [creds, setCreds] = useState(null)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([client.get('/admin/users'), client.get('/admin/jds')]).then(([u, j]) => { setUsers(u.data); setJds(j.data) }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => (u.full_name || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.jd_title || '').toLowerCase().includes(q))
  }, [users, search])

  const openCreate = () => { setForm(emptyForm); setError(''); setCreds(null); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = { ...form, jd_id: form.jd_id || null }
      const { data } = await client.post('/admin/users', payload)
      setCreds({ username: data.user.username, password: data.generated_password })
      load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not create this candidate.')
    } finally { setSaving(false) }
  }

  const reassign = async (user, jd_id) => { await client.put(`/admin/users/${user.id}`, { jd_id: jd_id || null }); load() }
  const remove = async (user) => { if (!confirm(`Remove ${user.full_name || user.username}? This cannot be undone.`)) return; await client.delete(`/admin/users/${user.id}`); load() }
  const copyCreds = () => { navigator.clipboard.writeText(`Username: ${creds.username}\nPassword: ${creds.password}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Admin</span>
          <h1 className="page-title">Candidates</h1>
          <p className="page-subtitle">Create accounts, assign job descriptions, and track prep activity.</p>
        </div>
        <button className="btn btn-violet" onClick={openCreate}><Plus size={16} /> Add candidate</button>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="Search by name, username, or JD…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{filtered.length} of {users.length}</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <p style={{ padding: 22 }}>Loading…</p> : filtered.length === 0 ? (
          <div className="empty-state"><h3>No candidates found</h3><p>Try a different search, or add a new candidate.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Candidate</th><th>Assigned JD</th><th>Level</th><th>Logins</th><th>Time spent</th><th>Self-rating</th><th></th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/admin/users/${u.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontWeight: 600 }}>{u.full_name || u.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>@{u.username}</div>
                    </Link>
                  </td>
                  <td>
                    <select className="input" style={{ padding: '6px 10px', fontSize: 12.5 }} value={u.jd_id || ''} onChange={(e) => reassign(u, e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {jds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge badge-${u.training_level}`}>{u.training_level}</span></td>
                  <td>{u.login_count}</td>
                  <td className="mono">{formatDuration(u.total_time_seconds)}</td>
                  <td>{u.avg_rating != null ? `${u.avg_rating} / 5` : '—'}</td>
                  <td><button className="icon-btn" onClick={() => remove(u)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{creds ? 'Candidate created' : 'Add a candidate'}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            {creds ? (
              <div>
                <p style={{ marginBottom: 16 }}>Share these sign-in details with the candidate. This password won't be shown again.</p>
                <div className="card" style={{ background: 'var(--violet-050)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="mono" style={{ fontSize: 13.5 }}>
                    <div>Username: <strong>{creds.username}</strong></div>
                    <div>Password: <strong>{creds.password}</strong></div>
                  </div>
                  <button className="icon-btn" onClick={copyCreds}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                  <button className="btn btn-violet" onClick={() => setModalOpen(false)}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
                <div className="form-grid">
                  <div className="field"><label>Full name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" /></div>
                  <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></div>
                  <div className="field"><label>Username</label><input className="input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jane.doe" /></div>
                  <div className="field"><label>Password (leave blank to auto-generate)</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Auto-generated if empty" /></div>
                  <div className="field"><label>Assign JD</label>
                    <select className="input" value={form.jd_id} onChange={(e) => setForm({ ...form, jd_id: e.target.value })}>
                      <option value="">— None yet —</option>
                      {jds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Training level</label>
                    <select className="input" value={form.training_level} onChange={(e) => setForm({ ...form, training_level: e.target.value })}>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                    </select>
                  </div>
                </div>
                {error && <div className="banner banner-error">{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-violet" disabled={saving}>{saving ? <><span className="spinner" /> Creating…</> : 'Create candidate'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
