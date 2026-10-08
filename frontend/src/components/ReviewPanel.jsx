import { useEffect, useState } from 'react'
import { ThumbsUp, PauseCircle, XCircle, RotateCcw, Lock, ShieldCheck } from 'lucide-react'
import client from '../api/client'
import { VERDICTS, fmtWhen } from './stages'
import '../styles/shared.css'
import '../styles/hub.css'

const ICONS = { proceed: ThumbsUp, hold: PauseCircle, reject: XCircle, re_interview: RotateCcw }

/**
 * The mandatory sign-off between "interview finished" and "share the report / another attempt".
 * Any admin can fill it in. Until a verdict is saved, the sharing step stays locked.
 */
export default function ReviewPanel({ sessionId, hasReport, completed = true, review, onSaved }) {
  const [verdict, setVerdict] = useState(review?.verdict || '')
  const [note, setNote] = useState(review?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => { setVerdict(review?.verdict || ''); setNote(review?.note || ''); setSaved('') }, [review?.verdict, review?.note, sessionId])

  const blocked = !completed || !hasReport
  const dirty = !review || review.verdict !== verdict || (review.note || '') !== note.trim()

  const save = async () => {
    if (!verdict) { setError('Choose a verdict first.'); return }
    if (verdict === 'reject' && !window.confirm('Mark this candidate as Rejected? Their login is not affected, but the report will no longer be offered for sharing by default.')) return
    setBusy(true); setError(''); setSaved('')
    try {
      const { data } = await client.post(`/admin/interview-sessions/${sessionId}/review`, { verdict, note })
      setSaved(data.attempt_granted ? 'Review saved - one more interview attempt has been granted.' : 'Review saved.')
      onSaved?.(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save the review.')
    } finally { setBusy(false) }
  }

  return (
    <div className={`review-panel ${blocked ? 'locked' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {blocked ? <Lock size={18} color="var(--red)" /> : <ShieldCheck size={18} color="var(--violet-600)" />}
        <h3>Review &amp; decision</h3>
        {review && <span className={`verdict-pill ${review.verdict}`} style={{ marginLeft: 6 }}>Reviewed</span>}
      </div>
      <p style={{ fontSize: 12.5, marginBottom: 14 }}>
        {blocked
          ? (!completed ? 'The interview must finish before it can be reviewed.' : 'Generate the report first, then record your decision here.')
          : 'Read the report, then choose a verdict. Sharing the report with the candidate stays locked until you do.'}
      </p>

      <div className="verdict-grid" role="radiogroup" aria-label="Verdict">
        {VERDICTS.map((v) => {
          const Icon = ICONS[v.key]
          return (
            <button key={v.key} type="button" role="radio" aria-checked={verdict === v.key}
              className={`verdict-card ${v.key} ${verdict === v.key ? 'selected' : ''}`}
              onClick={() => setVerdict(v.key)} disabled={blocked}>
              <span className="vi"><Icon size={16} /></span>
              <span><div className="vt">{v.label}</div><div className="vd">{v.hint}</div></span>
            </button>
          )
        })}
      </div>

      <div className="field">
        <label>Note for your team (optional)</label>
        <textarea className="input" rows={3} style={{ minHeight: 70 }} value={note} disabled={blocked}
          onChange={(e) => setNote(e.target.value)} placeholder="Why this decision? What should the next person know?" />
      </div>

      {error && <div className="banner banner-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
      {saved && <div className="banner banner-success" style={{ marginTop: 12, marginBottom: 0 }}>{saved}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
          {review ? `Last reviewed by ${review.reviewer_name || 'an admin'} · ${fmtWhen(review.reviewed_at)}` : 'Not reviewed yet'}
        </span>
        <button className="btn btn-violet" onClick={save} disabled={busy || blocked || !verdict || !dirty}>
          {busy ? <span className="spinner" /> : null} {review ? 'Update review' : 'Save review'}
        </button>
      </div>
    </div>
  )
}
