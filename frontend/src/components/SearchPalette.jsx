import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, Plus, UserPlus, Pin, Clock } from 'lucide-react'
import client from '../api/client'
import CandidateRow from './CandidateRow'
import { PipeBar } from './StageChip'
import { useAdminUi } from './AdminUi'
import { getPinned, getRecent, pushRecent, highlight } from './stages'
import '../styles/shared.css'
import '../styles/hub.css'

const FILTERS = [
  { key: 'needs_review', label: 'Needs my review' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'has_recording', label: 'Has recording' },
  { key: 'mode:real', label: 'Real interviews' },
  { key: 'mode:practice', label: 'Practice' },
]

/**
 * Ctrl+K / "/" anywhere in the admin. Type a role, a skill (from the JD *or* a resume), a name or
 * an email. Roles appear on the left; the right shows the highlighted role's candidates with
 * their stage, and below them anyone whose own details or resume match.
 */
export default function SearchPalette({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const ui = useAdminUi()
  const inputRef = useRef(null)
  const reqId = useRef(0)
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({})
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [home, setHome] = useState({ roles: [], pinned: [], recent: [] })

  const params = useMemo(() => {
    const p = {}
    if (q.trim()) p.q = q.trim()
    if (filters.needs_review) p.needs_review = 1
    if (filters.flagged) p.flagged = 1
    if (filters.has_recording) p.has_recording = 1
    if (filters.mode) p.mode = filters.mode
    return p
  }, [q, filters])
  const hasQuery = Object.keys(params).length > 0

  // Any navigation (clicking a candidate row, a role...) closes the palette.
  const where = location.pathname + location.search
  const firstWhere = useRef(where)
  useEffect(() => { if (open && where !== firstWhere.current) onClose(); firstWhere.current = where }, [where]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes even when focus has moved off the input.
  useEffect(() => {
    if (!open) return undefined
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Reset + focus when opened; load the roles used for pinned/recent when nothing is typed.
  useEffect(() => {
    if (!open) return undefined
    setQ(''); setFilters({}); setData(null); setError(''); setActive(0)
    setTimeout(() => inputRef.current?.focus(), 30)
    client.get('/admin/roles').then((r) => setHome({ roles: r.data, pinned: getPinned(), recent: getRecent() })).catch(() => {})
    return undefined
  }, [open])

  // Debounced search; stale responses are dropped.
  useEffect(() => {
    if (!open) return undefined
    if (!hasQuery) { setData(null); setLoading(false); return undefined }
    setLoading(true)
    const id = ++reqId.current
    const t = setTimeout(() => {
      client.get('/admin/search', { params }).then((r) => {
        if (id !== reqId.current) return
        setData(r.data); setError(''); setActive(0)
      }).catch(() => { if (id === reqId.current) setError('Search failed. Try again.') })
        .finally(() => { if (id === reqId.current) setLoading(false) })
    }, 220)
    return () => clearTimeout(t)
  }, [open, hasQuery, params])

  const roles = hasQuery ? (data?.roles || []) : []
  const activeRole = roles[active]
  const tokens = data?.tokens || []

  const openRole = useCallback((r) => { pushRecent(r.id); onClose(); navigate(`/admin/roles/${r.id}`) }, [navigate, onClose])

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (!roles.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(roles.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && activeRole) { e.preventDefault(); openRole(activeRole) }
  }

  const toggleFilter = (key) => setFilters((f) => {
    if (key.startsWith('mode:')) { const m = key.split(':')[1]; return { ...f, mode: f.mode === m ? undefined : m } }
    return { ...f, [key]: !f[key] }
  })
  const isOn = (key) => (key.startsWith('mode:') ? filters.mode === key.split(':')[1] : !!filters[key])

  const close = () => onClose()
  if (!open) return null

  const pinned = home.pinned.map((id) => home.roles.find((r) => r.id === id)).filter(Boolean)
  const recent = home.recent.map((id) => home.roles.find((r) => r.id === id)).filter((r) => r && !home.pinned.includes(r.id))
  const inActive = new Set((activeRole?.candidates || []).map((c) => c.id))
  const directCands = (data?.candidates || []).filter((c) => !inActive.has(c.id))

  const roleButton = (r, i, isActive) => (
    <button key={r.id} className={`p-role ${isActive ? 'active' : ''}`} onClick={() => openRole(r)} onMouseEnter={() => i != null && setActive(i)}>
      <div className="t">{tokens.length ? highlight(r.title, tokens) : r.title}{r.company ? <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}> - {r.company}</span> : null}</div>
      <div className="m">
        {r.total} candidate{r.total === 1 ? '' : 's'}{r.awaiting_review ? ` · ${r.awaiting_review} to review` : ''}
        {r.matched?.length ? ` · matched on ${r.matched.map((m) => (m === 'skills' ? 'required skills' : m)).join(', ')}` : ''}
      </div>
      {r.skills?.length > 0 && tokens.length > 0 && <div className="m" style={{ marginTop: 3 }}>{r.skills.slice(0, 5).map((s, k) => <span key={k}>{k ? ' · ' : ''}{highlight(s, tokens)}</span>)}</div>}
      <PipeBar pipeline={r.pipeline} total={r.total} />
    </button>
  )

  return (
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="palette" role="dialog" aria-label="Search" onKeyDown={onKey}>
        <div className="palette-input">
          <Search size={18} color="var(--ink-faint)" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roles, skills and candidates"
            placeholder="Search a role, a skill (e.g. React), a candidate or an email..." />
          {loading && <span className="spinner dark" />}
        </div>
        <div className="palette-chips">
          {FILTERS.map((f) => <button key={f.key} className={`fchip ${isOn(f.key) ? 'on' : ''}`} onClick={() => toggleFilter(f.key)} aria-pressed={isOn(f.key)}>{f.label}</button>)}
        </div>

        <div className="palette-body">
          <div className="palette-col" aria-label="Roles">
            {!hasQuery && (
              <>
                <div className="palette-h">Quick actions</div>
                <button className="p-act" onClick={() => { close(); ui.openRoleForm() }}><Plus size={16} /> New role</button>
                <button className="p-act" onClick={() => { close(); ui.openAddCandidate() }}><UserPlus size={16} /> Add candidate</button>
                {pinned.length > 0 && <div className="palette-h"><Pin size={11} style={{ verticalAlign: -1 }} /> Pinned roles</div>}
                {pinned.map((r) => roleButton(r, null, false))}
                {recent.length > 0 && <div className="palette-h"><Clock size={11} style={{ verticalAlign: -1 }} /> Recent</div>}
                {recent.map((r) => roleButton(r, null, false))}
                {pinned.length === 0 && recent.length === 0 && home.roles.length > 0 && (
                  <>
                    <div className="palette-h">Roles</div>
                    {home.roles.slice(0, 6).map((r) => roleButton(r, null, false))}
                  </>
                )}
              </>
            )}
            {hasQuery && (
              <>
                <div className="palette-h">Roles{roles.length ? ` (${roles.length})` : ''}</div>
                {roles.map((r, i) => roleButton(r, i, i === active))}
                {data && roles.length === 0 && <p style={{ padding: '6px 20px', fontSize: 13, color: 'var(--ink-faint)' }}>No role matches{q.trim() ? ` "${q.trim()}"` : ' these filters'}.</p>}
                {data && activeRole && <button className="p-act" onClick={() => { close(); ui.openAddCandidate(activeRole.id) }}><UserPlus size={16} /> Add candidate to {activeRole.title}</button>}
              </>
            )}
          </div>

          <div className="palette-col" aria-label="Candidates">
            {!hasQuery && <p style={{ padding: '18px 20px', fontSize: 13, color: 'var(--ink-faint)' }}>
              Type to search. A word from a job description finds the role and everyone in its pipeline; a word from a resume (such as a skill) finds the candidate directly.
            </p>}
            {error && <div className="banner banner-error" style={{ margin: 16 }}>{error}</div>}
            {hasQuery && data && (
              <>
                {activeRole && (
                  <>
                    <div className="palette-h">In {activeRole.title} ({activeRole.candidates_total})</div>
                    {activeRole.candidates.length === 0 && <p style={{ padding: '6px 20px', fontSize: 13, color: 'var(--ink-faint)' }}>{activeRole.total ? 'No candidates here match the filters.' : 'No candidates in this role yet.'}</p>}
                    {activeRole.candidates.map((c) => <CandidateRow key={`r${c.id}`} c={c} tokens={tokens} />)}
                  </>
                )}
                {directCands.length > 0 && (
                  <>
                    <div className="palette-h">Matching candidates ({directCands.length})</div>
                    {directCands.map((c) => <CandidateRow key={`d${c.id}`} c={c} tokens={tokens} showRole />)}
                  </>
                )}
                {!activeRole && directCands.length === 0 && <p style={{ padding: '18px 20px', fontSize: 13, color: 'var(--ink-faint)' }}>Nothing matches. Try a skill, a role title or a name.</p>}
              </>
            )}
          </div>
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choose a role</span><span><kbd>Enter</kbd> open role</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  )
}
