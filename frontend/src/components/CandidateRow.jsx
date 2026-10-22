import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flag, Video, Check } from 'lucide-react'
import StageChip from './StageChip'
import { actionPath, highlight, inviteText, verdictLabel } from './stages'
import '../styles/hub.css'

/** One candidate: who, type, stage, attempts, score, flags and the ONE next action. */
export default function CandidateRow({ c, tokens, selectable, selected, onSelect, showRole }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const open = () => navigate(`/admin/users/${c.id}${c.action?.type === 'review_report' ? '?step=review' : ''}`)

  const act = async (e) => {
    e.stopPropagation()
    if (!c.action || c.action.enabled === false) return
    if (c.action.type === 'copy_invite') {
      try { await navigator.clipboard.writeText(inviteText(c)); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
      return
    }
    navigate(actionPath(c))
  }

  return (
    <div className={`cand-row ${c.blocker ? 'has-blocker' : ''}`} onClick={open} role="row">
      {selectable
        ? <input className="pick" type="checkbox" checked={!!selected} onClick={(e) => e.stopPropagation()} onChange={() => onSelect?.(c)} aria-label={`Select ${c.name}`} />
        : <div className="cand-avatar">{(c.name || '?').slice(0, 1).toUpperCase()}</div>}
      <div className="who">
        <div className="nm">
          {tokens?.length ? highlight(c.name, tokens) : c.name}
          <span className={`type-chip ${c.mode}`}>{c.mode === 'practice' ? 'Practice' : 'Real'}</span>
        </div>
        <div className="sub">{showRole && c.jd_title ? `${c.jd_title} · ` : ''}{c.email || `@${c.username}`}</div>
      </div>
      <div>
        <StageChip stage={c.stage} label={c.stage === 'questions' && c.sub === 'generating' ? 'Generating questions' : undefined} />
        {c.blocker && <div className="blocker" style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 3 }}>{c.blocker}</div>}
      </div>
      <div>
        {c.score != null ? (
          <div className="score">{c.score}<small>/5</small>{c.review_verdict && <div><span className={`verdict-pill ${c.review_verdict}`}>{verdictLabel(c.review_verdict)}</span></div>}</div>
        ) : c.mode === 'real' ? <span style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{c.attempts_used}/{c.attempts_allowed} attempt{c.attempts_allowed === 1 ? '' : 's'}</span> : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
      </div>
      <div className="flags">
        {c.flagged && <span className="bad" title={`${c.violations} integrity violation${c.violations === 1 ? '' : 's'}`}><Flag size={15} /></span>}
        {c.has_recording && <span title="Recording available"><Video size={15} /></span>}
      </div>
      <div>
        {c.action && (
          <button className="btn btn-sm btn-ghost" onClick={act} disabled={c.action.enabled === false}>
            {copied ? <><Check size={13} /> Copied</> : c.action.label}
          </button>
        )}
      </div>
      {c.match?.snippet && <div className="why search-hit">{c.match.field === 'resume' ? 'On resume: ' : ''}{highlight(c.match.snippet, tokens)}</div>}
    </div>
  )
}
