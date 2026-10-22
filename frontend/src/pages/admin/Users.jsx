import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserPlus, Search, X } from 'lucide-react'
import client from '../../api/client'
import { useAdminUi } from '../../components/AdminUi'
import CandidateRow from '../../components/CandidateRow'
import { STAGE_ORDER, STAGE_SHORT } from '../../components/stages'
import '../../styles/shared.css'
import '../../styles/hub.css'

/** Every candidate across all roles, with their stage - the "Interviews" list is just the Live / Awaiting review filters here. */
export default function Candidates() {
  const ui = useAdminUi()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const stage = params.get('stage') || ''
  const mode = params.get('mode') || ''
  const flagged = params.get('flagged') === '1'

  useEffect(() => {
    client.get('/admin/candidates').then((r) => { setRows(r.data); setError('') }).catch(() => setError('Could not load candidates.'))
  }, [ui.version])

  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }

  const counts = useMemo(() => { const c = {}; (rows || []).forEach((r) => { c[r.stage] = (c[r.stage] || 0) + 1 }); return c }, [rows])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows || []).filter((r) => (!stage || r.stage === stage) && (!mode || r.mode === mode) && (!flagged || r.flagged)
      && (!t || r.name.toLowerCase().includes(t) || r.username.toLowerCase().includes(t) || (r.email || '').toLowerCase().includes(t) || (r.jd_title || '').toLowerCase().includes(t)))
  }, [rows, q, stage, mode, flagged])

  if (error) return <div className="banner banner-error">{error}</div>
  if (!rows) return <p>Loading...</p>

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Candidates</span>
          <h1 className="page-title">Candidates</h1>
          <p className="page-subtitle">Everyone across all roles. To search by resume skills, use the search bar (Ctrl K).</p>
        </div>
        <button className="btn btn-violet" onClick={() => ui.openAddCandidate()}><UserPlus size={16} /> Add candidate</button>
      </div>

      <div className="pipeline-strip">
        <button className={`pipeline-cell ${!stage ? 'active' : ''}`} onClick={() => setParam('stage', '')}><div className="n">{rows.length}</div><div className="l">All</div></button>
        {STAGE_ORDER.map((k) => (
          <button key={k} className={`pipeline-cell ${stage === k ? 'active' : ''} ${!counts[k] ? 'empty' : ''} ${k === 'awaiting_review' && counts[k] ? 'hot' : ''}`} onClick={() => setParam('stage', stage === k ? '' : k)}>
            <div className="n">{counts[k] || 0}</div><div className="l">{STAGE_SHORT[k]}</div>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--ink-faint)' }} />
          <input className="search-input" style={{ paddingLeft: 34 }} placeholder="Name, email, username or role" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className={`fchip ${mode === 'real' ? 'on' : ''}`} onClick={() => setParam('mode', mode === 'real' ? '' : 'real')}>Real interviews</button>
        <button className={`fchip ${mode === 'practice' ? 'on' : ''}`} onClick={() => setParam('mode', mode === 'practice' ? '' : 'practice')}>Practice</button>
        <button className={`fchip ${flagged ? 'on' : ''}`} onClick={() => setParam('flagged', flagged ? '' : '1')}>Flagged</button>
        {(stage || mode || flagged || q) && <button className="btn btn-outline btn-sm" onClick={() => { setParams({}, { replace: true }); setQ('') }}><X size={13} /> Clear</button>}
        <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{shown.length} of {rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state"><h3>No candidates yet</h3><p>Add a candidate to a role to get started.</p><button className="btn btn-violet" style={{ marginTop: 16 }} onClick={() => ui.openAddCandidate()}><UserPlus size={16} /> Add candidate</button></div>
      ) : shown.length === 0 ? (
        <div className="card empty-state"><h3>No candidates match</h3><p>Try clearing a filter.</p></div>
      ) : (
        <div className="card cand-list" style={{ padding: 0, overflow: 'hidden' }} role="table">
          {shown.map((c) => <CandidateRow key={c.id} c={c} showRole />)}
        </div>
      )}
    </div>
  )
}
