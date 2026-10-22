import { useEffect, useMemo, useState } from 'react'
import { Check, Lock, Clock } from 'lucide-react'
import { VERDICTS, fmtWhen } from './stages'
import '../styles/reportcard.css'

const TONES = ['violet', 'pink', 'cyan', 'amber', 'green', 'orange']
const R = 52
const C = 2 * Math.PI * R

const initials = (name) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

// Average answer score per topic, from the real Q&A. Nothing here is invented.
function topicScores(qna) {
  const by = new Map()
  for (const q of qna || []) {
    if (typeof q.score_pct !== 'number') continue
    const key = (q.topic || 'General').trim() || 'General'
    const cur = by.get(key) || { sum: 0, n: 0 }
    cur.sum += q.score_pct; cur.n += 1
    by.set(key, cur)
  }
  return [...by.entries()].map(([topic, v]) => ({ topic, pct: Math.round(v.sum / v.n), n: v.n })).slice(0, 6)
}

function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/**
 * The at-a-glance header of a report: overall score ring, per-topic bars, and (admin only)
 * the recorded verdict. `audience="candidate"` never shows the verdict or recommendation.
 */
export default function ReportScoreCard({ report, audience = 'admin', review = null, name = '', subtitle = '' }) {
  const isAdmin = audience === 'admin'
  const score = Number(report?.overall_score) || 0
  const topics = useMemo(() => topicScores(report?.qna), [report?.qna])
  const shown = useCountUp(score)
  const [go, setGo] = useState(false)
  useEffect(() => { setGo(false); const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t) }, [report?.id, score])

  const rec = isAdmin ? report?.recommendation : null
  const sub = subtitle || (report?.generated_at ? `Report generated ${fmtWhen(report.generated_at)}` : '')

  return (
    <div className="rc">
      <div className="rc-head">
        <div className="rc-who">
          <span className="rc-avatar">{name ? initials(name) : '★'}</span>
          <div>
            <b>{name || (isAdmin ? 'Interview report' : 'Your interview report')}</b>
            {sub && <span>{sub}</span>}
          </div>
        </div>
        <div className="rc-badges">
          {report?.verdict && <span className="rc-pill neutral">{report.verdict}</span>}
          {rec && <span className={`rc-pill ${rec === 'Selected' ? 'ok' : rec === 'Rejected' ? 'bad' : 'warn'}`}>AI: {rec}</span>}
          {isAdmin && (review
            ? <span className="rc-pill ok"><Check size={13} /> Reviewed</span>
            : <span className="rc-pill warn"><Clock size={13} /> Awaiting review</span>)}
        </div>
      </div>

      <div className={`rc-grid ${topics.length === 0 ? 'solo' : ''}`}>
        <div className="rc-ring" role="img" aria-label={`Overall score ${score} out of 5`}>
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="rc-ringg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7C5CFF" /><stop offset=".5" stopColor="#FF5C8A" /><stop offset="1" stopColor="#FFB547" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={R} className="trk" />
            <circle cx="60" cy="60" r={R} className="val" style={{ strokeDasharray: C, strokeDashoffset: go ? C * (1 - Math.min(5, score) / 5) : C }} />
          </svg>
          <div className="rc-ring-n"><b>{shown.toFixed(1)}</b><span>out of 5</span></div>
        </div>

        {topics.length > 0 && (
          <div className="rc-bars">
            <div className="rc-bars-title">Score by topic</div>
            {topics.map((t, i) => (
              <div className="rc-bar" key={t.topic}>
                <div className="rc-bar-top"><span title={t.topic}>{t.topic}</span><b>{t.pct}%</b></div>
                <div className="rc-track"><i className={TONES[i % TONES.length]} style={{ width: go ? `${t.pct}%` : '0%', transitionDelay: `${0.12 + i * 0.1}s` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin ? (
        <>
          <div className="rc-verdicts" aria-label="Recorded verdict">
            {VERDICTS.map((v) => (
              <span key={v.key} className={`rc-v ${v.key} ${review?.verdict === v.key ? 'on' : ''} ${review && review.verdict !== v.key ? 'dim' : ''}`}>{v.label}</span>
            ))}
          </div>
          <div className="rc-foot">
            {review
              ? <><Check size={14} /> {review.reviewer_name || 'An admin'} recorded {VERDICTS.find((v) => v.key === review.verdict)?.label || review.verdict}{review.reviewed_at ? ` · ${fmtWhen(review.reviewed_at)}` : ''}</>
              : <><Clock size={14} /> No verdict yet. Record one below to unlock sharing.</>}
          </div>
        </>
      ) : (
        <div className="rc-foot"><Lock size={14} /> Shared with you by your interviewer. The final hiring decision is theirs.</div>
      )}
    </div>
  )
}
