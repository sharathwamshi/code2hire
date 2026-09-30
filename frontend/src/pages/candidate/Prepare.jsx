import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Lightbulb, FolderGit2, ChevronDown, MessageSquareHeart, Loader2 } from 'lucide-react'
import client from '../../api/client'
import NodeGraphBackdrop from '../../components/NodeGraphBackdrop'
import '../../styles/shared.css'
import './Candidate.css'

const POLL_INTERVAL_MS = 1500
const TERMINAL_STATUSES = ['complete', 'complete_with_errors', 'failed']

function TopicCard({ topic, index }) {
  const [open, setOpen] = useState(index === 0)
  const [activePath, setActivePath] = useState(0)
  return (
    <div className="topic-card topic-card-enter">
      <div className="topic-header" onClick={() => setOpen((o) => !o)}>
        <div className="topic-index">{String(index + 1).padStart(2, '0')}</div>
        <div className="topic-title-block">
          <div className="topic-jd-point">
            {topic.jd_point} {topic.found_in_resume ? <span className="badge badge-low" style={{ marginLeft: 8 }}>on your resume</span> : <span className="badge badge-medium" style={{ marginLeft: 8 }}>not on your resume</span>}
          </div>
          <div className="topic-question">{topic.opening_question}</div>
        </div>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, color: 'var(--ink-faint)' }} />
      </div>
      {open && (
        <div className="topic-body">
          {topic.evidence_from_resume && <div className="evidence-line">From your resume: "{topic.evidence_from_resume}"</div>}
          {topic.answer_paths?.length > 0 && (
            <>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 8 }}>If you answer this way, here's where it likely goes next:</div>
                <div className="path-tabs">
                  {topic.answer_paths.map((p, i) => <button key={i} className={`path-tab ${activePath === i ? 'active' : ''}`} onClick={() => setActivePath(i)}>{p.path_label}</button>)}
                </div>
              </div>
              {topic.answer_paths[activePath] && (
                <div className="path-detail">
                  <div><div className="label">Sample answer to aim for</div><p>{topic.answer_paths[activePath].example_answer}</p></div>
                  <div className="followup-question">Likely next question → {topic.answer_paths[activePath].follow_up_question}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StageLoadingRow({ label }) {
  return <div className="stage-loading-row"><Loader2 size={15} className="spin" /><span>{label}</span></div>
}

export default function Prepare() {
  const [phase, setPhase] = useState('checking')
  const [flow, setFlow] = useState({ topics: [], project_questions: [], prep_tips: [] })
  const [totalTopics, setTotalTopics] = useState(0)
  const [topicsDone, setTopicsDone] = useState(0)
  const [warnings, setWarnings] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef(null)

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  const pollStatus = (prepFlowId) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/candidate/prepare/status/${prepFlowId}`)
        setFlow(data.flow); setTopicsDone(data.topics_done); setTotalTopics(data.total_topics)
        if (TERMINAL_STATUSES.includes(data.status)) {
          stopPolling()
          if (data.status === 'failed') { setPhase('error'); setErrorMsg(data.error_message || 'Could not generate your prep flow.') }
          else { setPhase('done'); setWarnings(data.error_message ? [data.error_message] : null) }
        }
      } catch (err) {
        stopPolling(); setPhase('error'); setErrorMsg(err?.response?.data?.error || 'Lost connection while preparing your questions.')
      }
    }, POLL_INTERVAL_MS)
  }

  const startGeneration = async () => {
    stopPolling(); setPhase('generating'); setErrorMsg(''); setWarnings(null)
    setFlow({ topics: [], project_questions: [], prep_tips: [] }); setTopicsDone(0)
    try {
      const { data } = await client.post('/candidate/prepare/start')
      setTotalTopics(data.total_topics)
      pollStatus(data.prep_flow_id)
    } catch (err) {
      setPhase('error'); setErrorMsg(err?.response?.data?.error || 'Could not start generating your prep flow.')
    }
  }

  const checkCacheThenLoad = async () => {
    setPhase('checking')
    try {
      const { data } = await client.get('/candidate/prepare')
      if (data.cached) {
        setFlow(data.flow); setTotalTopics(data.flow.topics.length); setTopicsDone(data.flow.topics.length)
        setWarnings(data.warnings || null); setPhase('done')
      } else { startGeneration() }
    } catch (err) {
      setPhase('error'); setErrorMsg(err?.response?.data?.error || 'Could not load your prep flow.')
    }
  }

  useEffect(() => { checkCacheThenLoad(); return stopPolling }, [])

  const generating = phase === 'generating' || phase === 'checking'
  const topicsRemaining = Math.max(0, totalTopics - topicsDone)
  const topicsFullyDone = totalTopics > 0 && topicsDone >= totalTopics
  const showProjectsLoading = phase === 'generating' && topicsFullyDone && flow.project_questions.length === 0
  const showTipsLoading = phase === 'generating' && topicsFullyDone && flow.prep_tips.length === 0

  return (
    <div>
      <div className="prep-hero">
        <NodeGraphBackdrop nodeCount={50} />
        <div className="prep-hero-content">
          <span className="page-eyebrow" style={{ color: 'var(--violet-100)' }}>Prepare</span>
          <h1>Walk through it before they ask.</h1>
          <p>Mapped from your resume against the role's requirements — topic by topic, with the way each answer branches into the next question.</p>
          {phase === 'generating' && totalTopics > 0 && (
            <div className="prep-progress">
              <div className="prep-progress-bar"><div className="prep-progress-fill" style={{ width: `${(topicsDone / totalTopics) * 100}%` }} /></div>
              <span>{topicsDone} of {totalTopics} topics ready{topicsRemaining > 0 ? ` · ${topicsRemaining} more on the way` : ''}</span>
            </div>
          )}
          <div className="prep-hero-actions">
            <button className="btn btn-ghost btn-sm" onClick={startGeneration} disabled={generating} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.24)' }}>
              <RefreshCw size={14} className={generating ? 'spin' : ''} /> {generating ? 'Preparing…' : 'Regenerate flow'}
            </button>
          </div>
        </div>
      </div>

      {phase === 'checking' && <div className="card" style={{ textAlign: 'center', padding: 50 }}><span className="spinner dark" style={{ width: 24, height: 24 }} /><p style={{ marginTop: 14 }}>Checking for your prep flow…</p></div>}
      {phase === 'error' && <div className="banner banner-error">{errorMsg}</div>}
      {warnings && phase === 'done' && <div className="banner banner-info">Some parts couldn't be generated: {warnings.join(' ')}</div>}

      {(phase === 'generating' || phase === 'done') && flow.topics.length > 0 && (
        <>
          <div className="section-title"><Lightbulb size={18} color="var(--violet-600)" /> By requirement</div>
          {flow.topics.map((t, i) => <TopicCard key={t.id || i} topic={t} index={i} />)}
          {phase === 'generating' && topicsRemaining > 0 && <StageLoadingRow label={`Mapping ${topicsRemaining} more requirement${topicsRemaining === 1 ? '' : 's'} against your resume…`} />}

          {(flow.project_questions.length > 0 || showProjectsLoading) && (
            <>
              <div className="section-title"><FolderGit2 size={18} color="var(--violet-600)" /> From your projects</div>
              {showProjectsLoading && <StageLoadingRow label="Finding relevant projects from your resume…" />}
              {flow.project_questions.map((p, i) => (
                <div className="project-card topic-card-enter" key={p.id || i}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.project_name}</div>
                  <p style={{ fontSize: 12.5, marginBottom: 10 }}>{p.why_relevant}</p>
                  <div className="followup-question" style={{ marginBottom: 12 }}>{p.question}</div>
                  {p.probable_answer_points?.length > 0 && <ul style={{ margin: '0 0 10px', paddingLeft: 18, display: 'grid', gap: 4 }}>{p.probable_answer_points.map((pt, j) => <li key={j} style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{pt}</li>)}</ul>}
                  {p.likely_follow_ups?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{p.likely_follow_ups.map((f, j) => <span key={j} className="badge badge-neutral">{f}</span>)}</div>}
                </div>
              ))}
            </>
          )}

          {(flow.prep_tips.length > 0 || showTipsLoading) && (
            <div className="card topic-card-enter" style={{ marginTop: 24, background: 'var(--violet-050)' }}>
              <h3 style={{ marginBottom: 12 }}>Before you go in</h3>
              {showTipsLoading && <StageLoadingRow label="Gathering final tips…" />}
              {flow.prep_tips.length > 0 && <ul className="tips-list">{flow.prep_tips.map((tip, i) => <li key={i}>• {tip}</li>)}</ul>}
            </div>
          )}

          {phase === 'done' && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link to="/app/feedback" className="btn btn-violet"><MessageSquareHeart size={16} /> Rate how well you know these topics</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
