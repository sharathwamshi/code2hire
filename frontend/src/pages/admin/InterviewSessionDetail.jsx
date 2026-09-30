import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play, RotateCcw, PauseCircle, AlertTriangle, Download, Sparkles, ShieldAlert, Radio } from 'lucide-react'
import client from '../../api/client'
import { getSocket } from '../../api/socket'
import ShareReportButton from '../../components/ShareReportButton'
import RecordingButton from '../../components/RecordingButton'
import '../../styles/shared.css'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const SEVERITY_ICON = { low: '🟡', medium: '🟠', high: '🔴' }

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function InterviewSessionDetail() {
  const { id } = useParams()
  const [session, setSession] = useState(null)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [transcriptPaste, setTranscriptPaste] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const liveVideoRef = useRef(null)
  const livePcRef = useRef(null)

  const load = () => client.get(`/admin/interview-sessions/${id}`).then((r) => setSession(r.data))
  useEffect(() => { load() }, [id])

  // Watches the candidate's camera live via the same signaling relay Live Interview uses,
  // one-way: this side only ever receives, never sends. Active whenever the AI interview is
  // running or paused (the candidate's camera keeps broadcasting through a pause).
  useEffect(() => {
    if (!session || session.mode !== 'ai' || !['in_progress', 'paused'].includes(session.status)) {
      setLiveConnected(false)
      return undefined
    }
    const room = `ai-session-${session.id}`
    const socket = getSocket()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    livePcRef.current = pc
    pc.ontrack = (e) => { if (liveVideoRef.current) liveVideoRef.current.srcObject = e.streams[0] }
    pc.onconnectionstatechange = () => setLiveConnected(pc.connectionState === 'connected')
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('signal', { room, payload: { type: 'ice-candidate', candidate: e.candidate } }) }

    const onSignal = async (payload) => {
      try {
        if (payload.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('signal', { room, payload: { type: 'answer', sdp: answer } })
        } else if (payload.type === 'ice-candidate') {
          await pc.addIceCandidate(payload.candidate)
        }
      } catch (e) {
        // The live view is a convenience for the admin, not something the session page can
        // depend on - a bad/late signal must never break the rest of this page.
      }
    }
    socket.on('signal', onSignal)
    socket.emit('join_room', { room, role: 'admin' })

    return () => {
      socket.off('signal', onSignal)
      socket.emit('leave_room', { room })
      pc.close()
      livePcRef.current = null
      setLiveConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.mode, session?.status])

  if (!session) return <p>Loading…</p>

  const act = async (action, note) => {
    setActing(true); setError(''); setNotice('')
    try {
      await client.post(`/admin/interview-sessions/${id}/${action}`, { note })
      setNotice(`Session ${action === 'manual-pause' ? 'paused' : action}.`)
      load()
    } catch (err) {
      setError(err?.response?.data?.error || `Could not ${action} this session.`)
    } finally {
      setActing(false)
    }
  }

  const generateReport = async () => {
    setGeneratingReport(true); setError(''); setNotice('')
    try {
      await client.post(`/admin/interview-sessions/${id}/generate-report`, transcriptPaste ? { transcript_text: transcriptPaste } : {})
      setNotice('Report generated.')
      setTranscriptPaste('')
      load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not generate the report.')
    } finally {
      setGeneratingReport(false)
    }
  }

  const downloadReportPdf = async () => {
    setDownloadingPdf(true); setError('')
    try {
      const res = await client.get(`/admin/interview-sessions/${id}/report/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `interview-report-${(session?.candidate_name || id).replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Could not download the report PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const report = session.report

  return (
    <div>
      <Link to="/admin/interview-sessions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--ink-faint)', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={15} /> Back to interview sessions
      </Link>

      <div className="page-header">
        <div>
          <span className="page-eyebrow">{session.mode === 'ai' ? 'AI Interview' : 'Live Interview'}</span>
          <h1 className="page-title">{session.candidate_name}</h1>
          <p className="page-subtitle">{session.jd_title} · <span className={`badge badge-${session.status === 'in_progress' ? 'inprogress' : session.status}`}>{session.status}</span></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {session.status === 'in_progress' && <button className="btn btn-outline" onClick={() => act('manual-pause')} disabled={acting}><PauseCircle size={15} /> Pause</button>}
          {session.status === 'paused' && <button className="btn btn-violet" onClick={() => act('resume')} disabled={acting}><Play size={15} /> Resume</button>}
          <button className="btn btn-outline" onClick={() => { if (confirm('Restart? Current Q&A will be discarded.')) act('restart') }} disabled={acting}><RotateCcw size={15} /> Restart</button>
        </div>
      </div>

      {notice && <div className="banner banner-success">{notice}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {session.mode === 'ai' && ['in_progress', 'paused'].includes(session.status) && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="admin-live-tile">
            <video ref={liveVideoRef} autoPlay playsInline />
            {liveConnected && <span className="admin-live-badge"><Radio size={11} /> Live</span>}
            {!liveConnected && <div className="admin-live-waiting">Connecting to the candidate&rsquo;s camera…</div>}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ marginBottom: 6 }}>Live view</h3>
            <p style={{ fontSize: 13 }}>
              {liveConnected
                ? "You're watching this interview live. The full session is also being recorded for the report."
                : 'Waiting for a live connection to the candidate\u2019s camera. This can take a few seconds, or may not connect if their network blocks peer-to-peer video.'}
            </p>
          </div>
        </div>
      )}

      {session.violation_count > 0 && (
        <div className="banner banner-warning" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} /> This session has {session.violation_count} integrity violation{session.violation_count === 1 ? '' : 's'} logged below.
        </div>
      )}
      {session.end_reason === 'candidate_exit' && (
        <div className="banner banner-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} /> The candidate ended this interview early, after answering {session.answered_count}{session.planned_count ? ` of ${session.planned_count}` : ''} questions. The report is based on those answers only.
        </div>
      )}
      {session.notice_count > 0 && (
        <div className="banner banner-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} /> {session.notice_count} window-focus notice{session.notice_count === 1 ? '' : 's'} — the candidate left the interview window but the interview was not paused.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Conversation transcript</h3>
          <div style={{ maxHeight: 480, overflowY: 'auto', display: 'grid', gap: 10 }}>
            {(!session.turns || session.turns.length === 0) && <p style={{ fontSize: 13 }}>No conversation recorded yet.</p>}
            {session.turns?.map((t) => (
              <div key={t.id} style={{ padding: '10px 14px', borderRadius: 10, background: t.role === 'candidate' ? 'var(--violet-050)' : 'var(--surface-sunken)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: t.role === 'candidate' ? 'var(--violet-700)' : 'var(--ink-faint)', marginBottom: 4 }}>
                  {t.role === 'candidate' ? session.candidate_name : 'AI Interviewer'} {t.topic ? `· ${t.topic}` : ''}
                </div>
                <div style={{ fontSize: 13.5 }}>{t.content}</div>
              </div>
            ))}
          </div>

          {session.mode === 'live' && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Paste call transcript to generate a report</div>
              <p style={{ fontSize: 11.5, marginBottom: 8 }}>Live calls aren't auto-transcribed in this build. Paste lines like "AI: ..." / "CANDIDATE: ..." below, or leave blank to use the transcript above if one exists.</p>
              <textarea className="input" rows={5} value={transcriptPaste} onChange={(e) => setTranscriptPaste(e.target.value)} placeholder={'AI: Can you describe your experience...\nCANDIDATE: I have about 5 years...'} />
            </div>
          )}

          {session.recording_path && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Recording</div>
              <RecordingButton sessionId={session.id} />
            </div>
          )}

          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={generateReport} disabled={generatingReport}>
            {generatingReport ? <span className="spinner dark" /> : <Sparkles size={14} />} {report ? 'Regenerate report' : 'Generate report'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card">
            <h3 style={{ marginBottom: 14 }}>Integrity timeline</h3>
            {(!session.violations || session.violations.length === 0) ? (
              <p style={{ fontSize: 13 }}>No violations detected — clean session.</p>
            ) : (
              <div className="violation-timeline">
                {session.violations.map((v) => (
                  <div key={v.id} className={`violation-row severity-${v.severity}`}>
                    <div className="violation-icon">{SEVERITY_ICON[v.severity]}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{v.event_type.replace('_', ' ')}{v.event_type === 'window_blur' && <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--ink-faint)' }}> · notice only, interview not paused</span>}</div>
                      <div className="violation-meta">Q{v.active_question_seq} · {fmt(v.occurred_at)} · {v.severity} severity</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 14 }}>Admin action log</h3>
            {(!session.action_logs || session.action_logs.length === 0) ? (
              <p style={{ fontSize: 13 }}>No admin actions taken yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {session.action_logs.map((a) => (
                  <div key={a.id} style={{ fontSize: 12.5, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                    <strong style={{ textTransform: 'capitalize' }}>{a.action.replace('_', ' ')}</strong> by {a.actor_name} · {fmt(a.created_at)}
                    {a.note && <div style={{ color: 'var(--ink-faint)', marginTop: 2 }}>{a.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {report && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>Evaluation report</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="stat-value" style={{ fontSize: 22 }}>{report.overall_score}/5</span>
              <span className={`badge ${report.recommendation === 'Selected' ? 'badge-completed' : report.recommendation === 'Rejected' ? 'badge-paused' : 'badge-medium'}`}>{report.recommendation}</span>
              <span className="badge badge-neutral">{report.verdict}</span>
              <button className="btn btn-outline btn-sm" onClick={downloadReportPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <span className="spinner dark" /> : <Download size={14} />} Download PDF
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--violet-050)', borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {report.shared_with_candidate
                ? 'The candidate can see the evaluation (score, strengths, Q&A) on their dashboard. The recommendation and your rationale stay private to you.'
                : 'Only you can see this report. The candidate cannot see it until you share it.'}
            </span>
            <ShareReportButton sessionId={session.id} shared={report.shared_with_candidate} onChanged={() => load()} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <div className="page-eyebrow">Key strengths</div>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>{report.summary.key_strengths?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <div className="page-eyebrow">Areas for improvement</div>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>{report.summary.areas_for_improvement?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <div className="page-eyebrow">Technical skills</div>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>{report.summary.technical_skills?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <div className="page-eyebrow">Soft skills</div>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>{report.summary.soft_skills?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>

          <div className="banner banner-info" style={{ marginBottom: 20 }}>{report.summary.reason_for_selection}</div>

          <div className="page-eyebrow" style={{ marginBottom: 10 }}>Questions &amp; Answers ({report.qna?.length || 0})</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {report.qna?.map((qa, i) => (
              <div key={i} className="card" style={{ background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="badge badge-neutral">{qa.topic}</span>
                  <span className={`badge ${qa.score_pct >= 70 ? 'badge-low' : qa.score_pct >= 40 ? 'badge-medium' : 'badge-high'}`}>{qa.score_pct}%</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{qa.question}</div>
                <div style={{ fontSize: 12.5, background: 'var(--violet-050)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                  <strong>Candidate:</strong> {qa.candidate_answer}
                </div>
                <div style={{ fontSize: 12.5, background: '#EAF6EF', borderRadius: 8, padding: '8px 10px' }}>
                  <strong>Reference:</strong> {qa.reference_answer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
