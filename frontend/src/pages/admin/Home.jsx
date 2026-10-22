import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, UserPlus, ClipboardCheck, ListChecks, Radio, Share2, FileUp, CheckCircle2, Pin, ArrowRight } from 'lucide-react'
import client from '../../api/client'
import { useAdminUi } from '../../components/AdminUi'
import { PipeBar } from '../../components/StageChip'
import { STAGE_SHORT, STAGE_ORDER, getPinned, togglePinned, actionPath } from '../../components/stages'
import '../../styles/shared.css'
import '../../styles/hub.css'

const ICON = { review_report: ClipboardCheck, approve_questions: ListChecks, live_now: Radio, share_report: Share2, add_resume: FileUp }

export default function Home() {
  const ui = useAdminUi()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [pinned, setPinned] = useState(getPinned())

  useEffect(() => {
    client.get('/admin/home').then((r) => { setData(r.data); setError('') }).catch(() => setError('Could not load your dashboard.'))
  }, [ui.version])

  if (error) return <div className="banner banner-error">{error}</div>
  if (!data) return <p>Loading...</p>

  const { counts, attention, recent_roles: recent, pipeline } = data
  const first = (JSON.parse(localStorage.getItem('am_user') || '{}').full_name || '').split(' ')[0]
  const empty = counts.roles === 0
  const pinnedRoles = pinned.map((id) => recent.find((r) => r.id === id)).filter(Boolean)
  const shownRoles = [...pinnedRoles, ...recent.filter((r) => !pinned.includes(r.id))].slice(0, 6)

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Home</span>
          <h1 className="page-title">{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>
          <p className="page-subtitle">{counts.needs_attention > 0 ? `${counts.needs_attention} thing${counts.needs_attention === 1 ? ' is' : 's are'} waiting on you.` : 'You are all caught up.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => ui.openRoleForm()}><Plus size={16} /> New role</button>
          <button className="btn btn-violet" onClick={() => ui.openAddCandidate()} disabled={empty} title={empty ? 'Create a role first' : undefined}><UserPlus size={16} /> Add candidate</button>
        </div>
      </div>

      {empty ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 28px' }}>
          <h2 style={{ fontSize: 20 }}>Let&rsquo;s set up your first hire</h2>
          <p style={{ maxWidth: 520, margin: '8px auto 0' }}>Everything starts with a role. Add one and the rest of the flow guides you step by step.</p>
          <div className="onboard-steps">
            {[['Create a role', 'Paste the job description. Skills are picked out for you.'], ['Add candidates', 'Name, resume, and Practice or Real interview.'], ['Approve the questions', 'Review what the AI will ask before anyone interviews.'], ['Interview', 'Watch live, with camera and integrity checks.'], ['Review & share', 'Record a verdict, then share the report.']].map(([t, d], i) => (
              <div key={t} className="onboard-step"><span className="num">{i + 1}</span><div className="tt">{t}</div><div className="dd">{d}</div></div>
            ))}
          </div>
          <button className="btn btn-violet" style={{ marginTop: 24 }} onClick={() => ui.openRoleForm()}><Plus size={16} /> Create your first role</button>
        </div>
      ) : (
        <>
          <div className="tile-grid">
            <button className={`tile ${counts.awaiting_review ? 'hot' : ''}`} onClick={() => navigate('/admin/users?stage=awaiting_review')}><div className="n">{counts.awaiting_review}</div><div className="l">Interviews awaiting your review</div></button>
            <button className="tile" onClick={() => navigate('/admin/users?stage=questions')}><div className="n">{counts.questions_to_review}</div><div className="l">Question sets to approve</div></button>
            <button className="tile" onClick={() => navigate('/admin/users?stage=live')}><div className="n">{counts.live_now}</div><div className="l">Interviewing right now</div></button>
            <button className="tile" onClick={() => navigate('/admin/users?stage=reviewed')}><div className="n">{counts.ready_to_share}</div><div className="l">Reviewed, not yet shared</div></button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 28 }}>
            <div style={{ padding: '18px 20px 12px' }}><h3>Needs your attention</h3></div>
            {attention.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <CheckCircle2 size={28} color="var(--green)" />
                <h3 style={{ marginTop: 8 }}>You&rsquo;re all caught up</h3>
                <p>Nothing is waiting on a decision. New interviews and question sets will show up here.</p>
              </div>
            ) : (
              <div className="attn-list">
                {attention.map((a, i) => {
                  const Icon = ICON[a.kind] || ClipboardCheck
                  return (
                    <div key={`${a.kind}-${a.candidate_id}-${i}`} className="attn-item">
                      <span className={`ic ${a.kind}`}><Icon size={18} /></span>
                      <div className="tx">
                        <div className="a">{a.title}</div>
                        <div className="b">{a.role ? `${a.role} · ` : ''}{a.detail}{a.score != null ? ` · scored ${a.score}/5` : ''}</div>
                      </div>
                      <Link className="btn btn-sm btn-ghost" to={actionPath({ id: a.candidate_id, session_id: a.session_id, action: a.action })}>{a.action?.label || 'Open'} <ArrowRight size={13} /></Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3>Your roles</h3>
            <Link to="/admin/roles" style={{ fontSize: 13, color: 'var(--violet-600)', fontWeight: 600, textDecoration: 'none' }}>All roles <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>
          </div>
          <div className="role-grid" style={{ marginBottom: 28 }}>
            {shownRoles.map((r) => (
              <div key={r.id} className="role-card" role="button" tabIndex={0} onClick={() => navigate(`/admin/roles/${r.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/roles/${r.id}`) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div><div className="t">{r.title}</div><div className="c">{r.company || 'General role'}</div></div>
                  <button className={`pin-btn ${pinned.includes(r.id) ? 'on' : ''}`} aria-label={pinned.includes(r.id) ? 'Unpin role' : 'Pin role'} onClick={(e) => { e.stopPropagation(); setPinned(togglePinned(r.id)) }}><Pin size={15} fill={pinned.includes(r.id) ? 'currentColor' : 'none'} /></button>
                </div>
                <PipeBar pipeline={r.pipeline} total={r.total} />
                <div className="meta"><span>{r.total} candidate{r.total === 1 ? '' : 's'}</span>{r.awaiting_review > 0 && <span className="stage-chip tone-awaiting_review"><span className="dot" />{r.awaiting_review} to review</span>}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Everyone, by stage</h3>
            <PipeBar pipeline={pipeline} total={counts.candidates} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 12, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {STAGE_ORDER.filter((k) => pipeline[k] > 0).map((k) => (
                <Link key={k} to={`/admin/users?stage=${k}`} style={{ textDecoration: 'none' }}><strong>{pipeline[k]}</strong> {STAGE_SHORT[k]}</Link>
              ))}
              {counts.candidates === 0 && <span style={{ color: 'var(--ink-faint)' }}>No candidates yet - add the first one to a role.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
