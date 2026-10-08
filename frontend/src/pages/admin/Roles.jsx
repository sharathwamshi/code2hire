import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pin, Search } from 'lucide-react'
import client from '../../api/client'
import { useAdminUi } from '../../components/AdminUi'
import { PipeBar } from '../../components/StageChip'
import { getPinned, togglePinned } from '../../components/stages'
import '../../styles/shared.css'
import '../../styles/hub.css'

const SORTS = [
  { key: 'review', label: 'Most to review' },
  { key: 'recent', label: 'Newest' },
  { key: 'candidates', label: 'Most candidates' },
  { key: 'name', label: 'Name A-Z' },
]

export default function Roles() {
  const ui = useAdminUi()
  const navigate = useNavigate()
  const [roles, setRoles] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('review')
  const [pinned, setPinned] = useState(getPinned())
  const [error, setError] = useState('')

  useEffect(() => {
    client.get('/admin/roles').then((r) => setRoles(r.data)).catch(() => setError('Could not load roles.'))
  }, [ui.version])

  const shown = useMemo(() => {
    if (!roles) return []
    const t = q.trim().toLowerCase()
    let list = roles.filter((r) => !t || r.title.toLowerCase().includes(t) || (r.company || '').toLowerCase().includes(t) || (r.skills || []).some((s) => s.toLowerCase().includes(t)))
    const cmp = {
      review: (a, b) => b.awaiting_review - a.awaiting_review || b.total - a.total,
      recent: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      candidates: (a, b) => b.total - a.total,
      name: (a, b) => a.title.localeCompare(b.title),
    }[sort]
    list = [...list].sort(cmp)
    return [...list.filter((r) => pinned.includes(r.id)), ...list.filter((r) => !pinned.includes(r.id))]
  }, [roles, q, sort, pinned])

  if (error) return <div className="banner banner-error">{error}</div>
  if (!roles) return <p>Loading...</p>

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Roles</span>
          <h1 className="page-title">Roles</h1>
          <p className="page-subtitle">Every hire starts with a role. Open one to add candidates and move them through the pipeline.</p>
        </div>
        <button className="btn btn-violet" onClick={() => ui.openRoleForm()}><Plus size={16} /> New role</button>
      </div>

      {roles.length === 0 ? (
        <div className="card empty-state">
          <h3>No roles yet</h3>
          <p>Create your first role - paste the job description and we pick out the skills.</p>
          <button className="btn btn-violet" style={{ marginTop: 16 }} onClick={() => ui.openRoleForm()}><Plus size={16} /> Create a role</button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--ink-faint)' }} />
              <input className="search-input" style={{ paddingLeft: 34 }} placeholder="Filter roles by title, company or skill" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="search-input" style={{ minWidth: 0 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort roles">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{shown.length} of {roles.length}</span>
          </div>
          {shown.length === 0 ? <div className="card empty-state"><h3>No role matches &ldquo;{q}&rdquo;</h3></div> : (
            <div className="role-grid">
              {shown.map((r) => (
                <div key={r.id} className="role-card" role="button" tabIndex={0} onClick={() => navigate(`/admin/roles/${r.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/roles/${r.id}`) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div><div className="t">{r.title}</div><div className="c">{r.company || 'General role'}</div></div>
                    <button className={`pin-btn ${pinned.includes(r.id) ? 'on' : ''}`} aria-label={pinned.includes(r.id) ? 'Unpin role' : 'Pin role'} onClick={(e) => { e.stopPropagation(); setPinned(togglePinned(r.id)) }}><Pin size={15} /></button>
                  </div>
                  {r.skills?.length > 0 && <div className="chip-row">{r.skills.slice(0, 4).map((s, i) => <span key={i} className="skill-chip">{s}</span>)}{r.skills.length > 4 && <span className="skill-chip">+{r.skills.length - 4}</span>}</div>}
                  <PipeBar pipeline={r.pipeline} total={r.total} />
                  <div className="meta">
                    <span>{r.total} candidate{r.total === 1 ? '' : 's'}{r.live > 0 ? ` · ${r.live} live` : ''}</span>
                    {r.awaiting_review > 0 ? <span className="stage-chip tone-awaiting_review"><span className="dot" />{r.awaiting_review} to review</span> : <span style={{ color: 'var(--ink-faint)' }}>Nothing to review</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
