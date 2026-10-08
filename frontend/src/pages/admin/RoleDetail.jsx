import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, UserPlus, Pencil, Trash2, Download, Sparkles, Share2, GitCompare, Pin, X, Search, ChevronDown, ChevronUp } from 'lucide-react'
import client from '../../api/client'
import { useAdminUi } from '../../components/AdminUi'
import CandidateRow from '../../components/CandidateRow'
import StageChip from '../../components/StageChip'
import { STAGE_ORDER, STAGE_SHORT, BOARD_LANES, getPinned, togglePinned, pushRecent, verdictLabel } from '../../components/stages'
import '../../styles/shared.css'
import '../../styles/hub.css'

export default function RoleDetail() {
  const { id } = useParams()
  const ui = useAdminUi()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [view, setView] = useState('list')
  const [picked, setPicked] = useState([])
  const [compare, setCompare] = useState(null)
  const [busy, setBusy] = useState('')
  const [showJd, setShowJd] = useState(false)
  const [pinned, setPinned] = useState(getPinned())
  const stage = params.get('stage') || ''

  const load = () => client.get(`/admin/roles/${id}`).then((r) => { setRole(r.data); setError('') }).catch((e) => setError(e?.response?.status === 404 ? 'This role no longer exists.' : 'Could not load this role.'))
  useEffect(() => { load(); pushRecent(Number(id)) }, [id, ui.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const setStage = (s) => { const p = new URLSearchParams(params); if (s) p.set('stage', s); else p.delete('stage'); setParams(p, { replace: true }) }

  const cands = role?.candidates || []
  const visible = useMemo(() => {
    const t = name.trim().toLowerCase()
    return cands.filter((c) => (!stage || c.stage === stage) && (!t || c.name.toLowerCase().includes(t) || (c.email || '').toLowerCase().includes(t) || c.username.toLowerCase().includes(t)))
  }, [cands, stage, name])

  if (error) return <div><Link to="/admin/roles" className="btn btn-outline btn-sm"><ArrowLeft size={14} /> All roles</Link><div className="banner banner-error" style={{ marginTop: 16 }}>{error}</div></div>
  if (!role) return <p>Loading...</p>

  const pl = role.pipeline
  const generatable = cands.filter((c) => c.mode === 'real' && c.stage === 'questions' && ['none', 'failed'].includes(c.sub) && c.has_resume).length
  const shareable = cands.filter((c) => c.stage === 'reviewed' && c.review_verdict === 'proceed').length

  const togglePick = (c) => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id].slice(-4)))

  const bulk = async (action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(action); setNotice(''); setError('')
    try {
      const { data } = await client.post(`/admin/roles/${id}/bulk`, { action })
      setNotice(action === 'generate_questions'
        ? `Started generating questions for ${data.started} candidate${data.started === 1 ? '' : 's'}. You still review and approve each set.`
        : `Shared ${data.shared} report${data.shared === 1 ? '' : 's'} (${data.skipped} skipped).`)
      load(); ui.bump()
    } catch (err) { setError(err?.response?.data?.error || 'That action did not go through.') } finally { setBusy('') }
  }

  const exportCsv = async () => {
    try {
      const res = await client.get(`/admin/roles/${id}/export.csv`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = `${role.title.replace(/[^A-Za-z0-9]+/g, '_')}_candidates.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { setError('Could not export the candidate list.') }
  }

  const openCompare = async () => {
    setCompare({ loading: true })
    try {
      const { data } = await client.get(`/admin/roles/${id}/compare`, { params: { ids: picked.join(',') } })
      setCompare({ rows: data.candidates })
    } catch (err) { setCompare({ error: err?.response?.data?.error || 'Could not build the comparison.' }) }
  }

  const removeRole = async () => {
    if (!window.confirm(`Delete "${role.title}"? ${role.total} candidate${role.total === 1 ? '' : 's'} will become unassigned (their data is kept).`)) return
    await client.delete(`/admin/jds/${id}`)
    ui.bump(); navigate('/admin/roles')
  }

  return (
    <div>
      <Link to="/admin/roles" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--ink-faint)', textDecoration: 'none', marginBottom: 18 }}><ArrowLeft size={15} /> All roles</Link>

      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <span className="page-eyebrow">Role</span>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {role.title}
            <button className={`pin-btn ${pinned.includes(role.id) ? 'on' : ''}`} aria-label="Pin role" onClick={() => setPinned(togglePinned(role.id))}><Pin size={17} /></button>
          </h1>
          <p className="page-subtitle">{role.company || 'General role'} · {role.total} candidate{role.total === 1 ? '' : 's'}</p>
          {role.skills?.length > 0 && <div className="chip-row" style={{ marginTop: 10 }}>{role.skills.map((s, i) => <span key={i} className="skill-chip">{s}</span>)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={role.total === 0}><Download size={14} /> Export</button>
          <button className="btn btn-outline btn-sm" onClick={() => ui.openRoleForm(role)}><Pencil size={14} /> Edit role</button>
          <button className="btn btn-outline btn-sm" onClick={removeRole} aria-label="Delete role"><Trash2 size={14} /></button>
          <button className="btn btn-violet" onClick={() => ui.openAddCandidate(role.id)}><UserPlus size={16} /> Add candidate</button>
        </div>
      </div>

      {notice && <div className="banner banner-success">{notice}</div>}

      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => setShowJd((s) => !s)}>{showJd ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showJd ? 'Hide' : 'Show'} job description</button>
      {showJd && <div className="card" style={{ marginBottom: 18, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65, maxHeight: 320, overflowY: 'auto' }}>{role.content}</div>}

      <div className="pipeline-strip" role="tablist" aria-label="Filter by stage">
        <button className={`pipeline-cell ${!stage ? 'active' : ''}`} onClick={() => setStage('')} role="tab" aria-selected={!stage}><div className="n">{role.total}</div><div className="l">All</div></button>
        {STAGE_ORDER.map((k) => (
          <button key={k} className={`pipeline-cell ${stage === k ? 'active' : ''} ${pl[k] === 0 ? 'empty' : ''} ${k === 'awaiting_review' && pl[k] > 0 ? 'hot' : ''}`} onClick={() => setStage(stage === k ? '' : k)} role="tab" aria-selected={stage === k}>
            <div className="n">{pl[k]}</div><div className="l">{STAGE_SHORT[k]}</div>
          </button>
        ))}
      </div>

      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--ink-faint)' }} />
            <input className="search-input" style={{ paddingLeft: 34 }} placeholder="Find a candidate in this role" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{visible.length} of {cands.length}</span>
          {stage && <button className="fchip on" onClick={() => setStage('')}>{STAGE_SHORT[stage]} <X size={11} style={{ verticalAlign: -1 }} /></button>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {generatable > 0 && <button className="btn btn-ghost btn-sm" onClick={() => bulk('generate_questions')} disabled={!!busy}>{busy === 'generate_questions' ? <span className="spinner dark" /> : <Sparkles size={14} />} Generate questions ({generatable})</button>}
          {shareable > 0 && <button className="btn btn-ghost btn-sm" onClick={() => bulk('share_reviewed', `Share ${shareable} report${shareable === 1 ? '' : 's'} marked Proceed with the candidates?`)} disabled={!!busy}>{busy === 'share_reviewed' ? <span className="spinner dark" /> : <Share2 size={14} />} Share Proceed reports ({shareable})</button>}
          <button className="btn btn-ghost btn-sm" onClick={openCompare} disabled={picked.length < 2}><GitCompare size={14} /> Compare{picked.length ? ` (${picked.length})` : ''}</button>
          <div className="view-toggle"><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button></div>
        </div>
      </div>
      {picked.length === 1 && <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: -8, marginBottom: 12 }}>Tick one or more other candidates (up to 4) to compare their results.</p>}

      {cands.length === 0 ? (
        <div className="card empty-state">
          <h3>No candidates in this role yet</h3>
          <p>Add your first candidate - name, resume, and whether it&rsquo;s practice or a real interview.</p>
          <button className="btn btn-violet" style={{ marginTop: 16 }} onClick={() => ui.openAddCandidate(role.id)}><UserPlus size={16} /> Add candidate</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card empty-state"><h3>Nobody here</h3><p>No candidate matches this stage and search.</p></div>
      ) : view === 'list' ? (
        <div className="card cand-list" style={{ padding: 0, overflow: 'hidden' }} role="table">
          {visible.map((c) => <CandidateRow key={c.id} c={c} selectable selected={picked.includes(c.id)} onSelect={togglePick} />)}
        </div>
      ) : (
        <div className="board">
          {BOARD_LANES.map((lane) => {
            const items = visible.filter((c) => lane.stages.includes(c.stage))
            return (
              <div className="lane" key={lane.key}>
                <h4><span>{lane.title}</span><span>{items.length}</span></h4>
                {items.map((c) => (
                  <div key={c.id} className="lane-card" onClick={() => navigate(`/admin/users/${c.id}`)}>
                    <div className="nm">{c.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <StageChip stage={c.stage} />
                      <span className={`type-chip ${c.mode}`}>{c.mode === 'practice' ? 'Practice' : 'Real'}</span>
                      {c.score != null && <strong style={{ fontSize: 12.5 }}>{c.score}/5</strong>}
                      {c.review_verdict && <span className={`verdict-pill ${c.review_verdict}`}>{verdictLabel(c.review_verdict)}</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink-faint)', padding: '4px 6px' }}>Empty</p>}
              </div>
            )
          })}
        </div>
      )}

      {compare && (
        <div className="modal-overlay" onClick={() => setCompare(null)}>
          <div className="modal-panel" style={{ maxWidth: 1000 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare candidates">
            <div className="modal-header"><h3>Compare candidates</h3><button className="icon-btn" onClick={() => setCompare(null)} aria-label="Close"><X size={18} /></button></div>
            {compare.loading && <p>Loading...</p>}
            {compare.error && <div className="banner banner-error">{compare.error}</div>}
            {compare.rows && (
              <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${compare.rows.length}, minmax(0, 1fr))` }}>
                {compare.rows.map((r) => (
                  <div key={r.id} className="compare-col">
                    <h4>{r.name}</h4>
                    {r.has_report ? (
                      <>
                        <div className="big">{r.score}<small style={{ fontSize: 14, color: 'var(--ink-faint)' }}>/5</small></div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.ai_verdict && <span className="badge badge-neutral">{r.ai_verdict}</span>}
                          {r.review_verdict ? <span className={`verdict-pill ${r.review_verdict}`}>{verdictLabel(r.review_verdict)}</span> : <span className="stage-chip tone-awaiting_review"><span className="dot" />Not reviewed</span>}
                        </div>
                        <div className="lab">Strengths</div><ul>{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        <div className="lab">To improve</div><ul>{r.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        <div className="lab">Technical</div><ul>{r.technical_skills.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Answered {r.answered}{r.planned ? ` of ${r.planned}` : ''} · {r.violations ? <span style={{ color: 'var(--red)' }}>{r.violations} violation{r.violations === 1 ? '' : 's'}</span> : 'clean session'}</div>
                        {r.session_id && <Link to={`/admin/interview-sessions/${r.session_id}`} className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setCompare(null)}>Open session</Link>}
                      </>
                    ) : <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No report yet - nothing to compare.</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
