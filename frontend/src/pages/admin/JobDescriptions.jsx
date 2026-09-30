import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Trash2, Pencil, Sparkles, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import client from '../../api/client'
import '../../styles/shared.css'

const emptyForm = { title: '', company: '', content: '' }

const SORT_COLUMNS = [
  { key: 'title', label: 'Role' },
  { key: 'company', label: 'Company' },
  { key: 'assigned_count', label: 'Candidates' },
  { key: 'created_at', label: 'Created' },
]

export default function JobDescriptions() {
  const [jds, setJds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [search, setSearch] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('all') // all | assigned | unassigned
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const load = () => {
    setLoading(true)
    client.get('/admin/jds').then((r) => setJds(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'created_at' || key === 'assigned_count' ? 'desc' : 'asc')
    }
  }

  const visibleJds = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = jds.filter((jd) => {
      if (assignedFilter === 'assigned' && !jd.assigned_count) return false
      if (assignedFilter === 'unassigned' && jd.assigned_count) return false
      if (!q) return true
      return (
        jd.title.toLowerCase().includes(q) ||
        (jd.company || '').toLowerCase().includes(q) ||
        (jd.content || '').toLowerCase().includes(q) ||
        (jd.key_points || []).some((p) => p.toLowerCase().includes(q))
      )
    })
    result = [...result].sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (sortKey === 'title' || sortKey === 'company') {
        av = (av || '').toLowerCase()
        bv = (bv || '').toLowerCase()
      }
      if (sortKey === 'created_at') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [jds, search, assignedFilter, sortKey, sortDir])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setWarning(''); setModalOpen(true) }
  const openEdit = (jd) => { setEditing(jd); setForm({ title: jd.title, company: jd.company || '', content: jd.content }); setError(''); setWarning(''); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setWarning('')
    try {
      if (editing) {
        await client.put(`/admin/jds/${editing.id}`, form)
      } else {
        const { data } = await client.post('/admin/jds', form)
        if (data.warning) setWarning(data.warning)
      }
      load()
      if (!warning) setModalOpen(false)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save this job description.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (jd) => {
    if (!confirm(`Delete "${jd.title}"? Candidates assigned to it will become unassigned.`)) return
    await client.delete(`/admin/jds/${jd.id}`)
    load()
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const sortIcon = (key) => {
    if (sortKey !== key) return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Admin</span>
          <h1 className="page-title">Job descriptions</h1>
          <p className="page-subtitle">Each JD is broken into its individual requirement points automatically, so prep and interview questions can be checked off against the resume one by one.</p>
        </div>
        <button className="btn btn-violet" onClick={openCreate}><Plus size={16} /> Add JD</button>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="Search by title, company, or requirement…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" style={{ padding: '9px 12px', fontSize: 13.5, width: 'auto' }} value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
          <option value="all">All JDs</option>
          <option value="assigned">Has candidates assigned</option>
          <option value="unassigned">No candidates assigned</option>
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{visibleJds.length} of {jds.length}</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <p style={{ padding: 22 }}>Loading…</p> : visibleJds.length === 0 ? (
          <div className="empty-state">
            <h3>No job descriptions found</h3>
            <p>{jds.length === 0 ? 'Add your first JD to start assigning candidates and generating prep flows.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {SORT_COLUMNS.map((col) => (
                  <th key={col.key} className="sortable-th" onClick={() => toggleSort(col.key)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{col.label} {sortIcon(col.key)}</span>
                  </th>
                ))}
                <th>Requirement points</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleJds.map((jd) => (
                <tr key={jd.id} className="clickable-row" onClick={() => openEdit(jd)}>
                  <td><div style={{ fontWeight: 600 }}>{jd.title}</div></td>
                  <td>{jd.company || <span style={{ color: 'var(--ink-faint)' }}>General role</span>}</td>
                  <td>{jd.assigned_count} candidate{jd.assigned_count === 1 ? '' : 's'}</td>
                  <td className="mono">{formatDate(jd.created_at)}</td>
                  <td>
                    {jd.key_points?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 260 }}>
                        {jd.key_points.slice(0, 3).map((p, i) => <span key={i} className="badge badge-neutral">{p}</span>)}
                        {jd.key_points.length > 3 && <span className="badge badge-neutral">+{jd.key_points.length - 3} more</span>}
                      </div>
                    ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="icon-btn" onClick={() => openEdit(jd)} title="Edit"><Pencil size={16} /></button>
                      <button className="icon-btn" onClick={() => remove(jd)} title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit job description' : 'Add a job description'}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
              <div className="form-grid">
                <div className="field"><label>Role title</label>
                  <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Backend Engineer" />
                </div>
                <div className="field"><label>Company / team (optional)</label>
                  <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Acme Bank — Platform" />
                </div>
                <div className="field field-full"><label>Full job description</label>
                  <textarea className="input" required rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Paste the complete JD here…" />
                </div>
              </div>
              {error && <div className="banner banner-error">{error}</div>}
              {warning && <div className="banner banner-info">{warning}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-violet" disabled={saving}>{saving ? <><span className="spinner" /> Saving…</> : 'Save job description'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
