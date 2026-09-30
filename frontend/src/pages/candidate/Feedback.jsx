import { useEffect, useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import client from '../../api/client'
import '../../styles/shared.css'
import './Candidate.css'

const RATING_LABELS = { 1: 'Just starting out', 2: 'Shaky', 3: 'Getting there', 4: 'Confident', 5: 'Could teach it' }

export default function Feedback() {
  const [topics, setTopics] = useState([])
  const [ratings, setRatings] = useState({})
  const [comments, setComments] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [history, setHistory] = useState([])
  const [avg, setAvg] = useState(null)

  useEffect(() => {
    client.get('/candidate/prepare').then((r) => {
      const flowTopics = (r.data.flow?.topics || []).map((t) => t.jd_point)
      const projectTopics = (r.data.flow?.project_questions || []).map((p) => p.project_name)
      setTopics([...flowTopics, ...projectTopics])
    }).catch(() => {})
    client.get('/candidate/feedback').then((r) => { setHistory(r.data.feedback); setAvg(r.data.avg_rating) })
  }, [])

  const setRating = (topic, val) => setRatings((r) => ({ ...r, [topic]: val }))
  const setComment = (topic, val) => setComments((c) => ({ ...c, [topic]: val }))

  const submit = async (e) => {
    e.preventDefault()
    const items = topics.filter((t) => ratings[t]).map((t) => ({ topic: t, self_rating: ratings[t], comments: comments[t] || null }))
    if (items.length === 0) return
    setSubmitting(true)
    try {
      const { data } = await client.post('/candidate/feedback', { items })
      setSubmitted(true); setAvg(data.avg_rating)
      const h = await client.get('/candidate/feedback')
      setHistory(h.data.feedback); setRatings({}); setComments({})
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Feedback</span>
          <h1 className="page-title">How well do you know this?</h1>
          <p className="page-subtitle">A quick honest self-check per topic. This rolls up into a single confidence score your admin can see.</p>
        </div>
        {avg != null && <div className="stat-card" style={{ minWidth: 140 }}><span className="stat-label">Your average</span><span className="stat-value">{avg}/5</span></div>}
      </div>

      {topics.length === 0 ? (
        <div className="card empty-state"><h3>No topics to rate yet</h3><p>Visit the Prepare tab first so we know which topics to ask about.</p></div>
      ) : (
        <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 22 }}>
          {topics.map((topic) => (
            <div key={topic} style={{ borderBottom: '1px solid var(--border-soft)', paddingBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10 }}>{topic}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button type="button" key={v} className={`path-tab ${ratings[topic] === v ? 'active' : ''}`} onClick={() => setRating(topic, v)}>{v} · {RATING_LABELS[v]}</button>
                ))}
              </div>
              <input className="input" placeholder="Optional note to yourself…" value={comments[topic] || ''} onChange={(e) => setComment(topic, e.target.value)} />
            </div>
          ))}
          {submitted && <div className="banner banner-success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> Feedback submitted — thanks for the honest check-in.</div>}
          <button type="submit" className="btn btn-violet" style={{ justifySelf: 'start' }} disabled={submitting}><Send size={15} /> {submitting ? 'Submitting…' : 'Submit feedback'}</button>
        </form>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Your history</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {history.map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <div><div style={{ fontSize: 13.5 }}>{f.topic}</div>{f.comments && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{f.comments}</div>}</div>
                <span className="badge badge-neutral">{f.self_rating}/5</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
