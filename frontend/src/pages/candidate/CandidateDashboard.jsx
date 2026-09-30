import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { UploadCloud, FileText, ArrowRight, CheckCircle2, Mic, History, X } from 'lucide-react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import ReportView from '../../components/ReportView'
import '../../styles/shared.css'
import './Candidate.css'

const STATUS = {
  completed: ['Completed', 'badge-completed'], in_progress: ['In progress', 'badge-inprogress'], paused: ['Paused', 'badge-paused'],
}
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export default function CandidateDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [resumeText, setResumeText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [interviews, setInterviews] = useState([])
  const [reportView, setReportView] = useState(null) // { row, report, loading, error }
  const fileRef = useRef(null)

  const load = () => {
    client.get('/candidate/dashboard').then((r) => setData(r.data))
    client.get('/candidate/resume').then((r) => setResumeText(r.data.resume_text || ''))
    client.get('/candidate/interview/history').then((r) => setInterviews(r.data)).catch(() => setInterviews([]))
  }
  useEffect(load, [])

  const onFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true); setUploadError(''); setNotice('')
    try {
      const { data } = await client.post('/candidate/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResumeText(data.resume_text || '')
      setNotice('Resume uploaded and parsed.')
      load()
    } catch (err) {
      setUploadError(err?.response?.data?.error || 'Could not read that file.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const saveText = async () => {
    setUploading(true)
    try { await client.post('/candidate/resume', { resume_text: resumeText }); setNotice('Resume saved.'); load() }
    finally { setUploading(false) }
  }

  const openReport = async (row) => {
    if (!row.has_report) return
    setReportView({ row, report: null, loading: true, error: '' })
    try {
      const { data: report } = await client.get(`/candidate/interview/${row.id}/report`)
      setReportView({ row, report, loading: false, error: '' })
    } catch (err) {
      setReportView({ row, report: null, loading: false, error: err?.response?.data?.error || 'Could not load this report.' })
    }
  }

  if (!data) return <p>Loading…</p>
  const { jd, has_resume } = data
  const u = data.user

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Welcome</span>
          <h1 className="page-title">Hi {u.full_name?.split(' ')[0] || u.username} 👋</h1>
          <p className="page-subtitle">Here's the role you're prepping for, and your resume on file.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {jd && has_resume && u.active_stage === 'prepare' && <Link to="/app/prepare" className="btn btn-violet">Prepare <ArrowRight size={15} /></Link>}
          {jd && has_resume && u.active_stage === 'interview' && <Link to="/app/interview" className="btn btn-violet"><Mic size={15} /> Start interview</Link>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="page-eyebrow" style={{ marginBottom: 8 }}>Assigned role</div>
          {jd ? (
            <>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>{jd.title}</h3>
              <p style={{ fontSize: 13, marginBottom: 14 }}>{jd.company || 'General role'}</p>
              {jd.key_points?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {jd.key_points.slice(0, 8).map((p, i) => <span key={i} className="badge badge-neutral">{p}</span>)}
                </div>
              )}
            </>
          ) : <p>No job description has been assigned to you yet — check back soon, or ask your admin.</p>}
        </div>

        <div className="card">
          <div className="page-eyebrow" style={{ marginBottom: 8 }}>Your training level</div>
          <span className={`badge badge-${u.training_level}`} style={{ fontSize: 14, padding: '6px 14px' }}>{u.training_level}</span>
          <p style={{ marginTop: 12, fontSize: 13 }}>This controls how sharp the follow-up questions in your prep flow and live interview are.</p>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
            <div className="page-eyebrow" style={{ marginBottom: 8 }}>Current phase</div>
            <span className="badge badge-neutral" style={{ fontSize: 13 }}>
              {u.active_stage === 'interview' ? 'Interview' : 'Preparation'}
            </span>
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-faint)' }}>
              {u.active_stage === 'interview'
                ? "You're set to take your interview. Your admin will switch you back to preparation if needed."
                : "You're preparing. Your admin will open up the interview when you're ready."}
            </p>
          </div>
        </div>
      </div>

      {interviews.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <History size={17} color="var(--violet-600)" />
            <h3>Your interviews</h3>
          </div>
          <p style={{ fontSize: 12.5, marginBottom: 14 }}>Your previous interviews. Your admin reviews each one first — when they share your report with you, you can open it here to see how you did, question by question.</p>
          <div style={{ overflowX: 'auto', margin: '0 -14px' }}>
            <table className="data-table">
              <thead><tr><th>When</th><th>Role</th><th>Status</th><th>Answered</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {interviews.map((row) => {
                  const [label, cls] = STATUS[row.status] || [row.status, 'badge-neutral']
                  return (
                    <tr key={row.id} className={row.has_report ? 'clickable-row' : undefined} onClick={() => openReport(row)}>
                      <td className="mono">{fmtWhen(row.completed_at || row.started_at)}</td>
                      <td>{row.jd_title || '—'}</td>
                      <td>
                        <span className={`badge ${cls}`}>{label}</span>
                        {row.end_reason === 'candidate_exit' && <span className="badge badge-medium" style={{ marginLeft: 6 }}>Ended early</span>}
                      </td>
                      <td>{row.mode === 'ai' ? `${row.answered_count}${row.planned_count ? ` of ${row.planned_count}` : ''}` : '—'}</td>
                      <td>
                        {row.report
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><strong>{row.report.overall_score}/5</strong><span className="badge badge-neutral">{row.report.verdict}</span></span>
                          : <span style={{ color: 'var(--ink-faint)' }}>{row.status === 'completed' ? 'Awaiting admin review' : '—'}</span>}
                      </td>
                      <td>{row.has_report && <button className="btn btn-ghost btn-sm">View report</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportView && (
        <div className="modal-overlay" onClick={() => setReportView(null)}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Interview report{reportView.row.jd_title ? ` · ${reportView.row.jd_title}` : ''}</h3>
                <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 4 }}>{fmtWhen(reportView.row.completed_at || reportView.row.started_at)}</div>
              </div>
              <button className="icon-btn" onClick={() => setReportView(null)} aria-label="Close"><X size={18} /></button>
            </div>

            {reportView.loading && <p style={{ fontSize: 13 }}>Loading report…</p>}
            {reportView.error && <div className="banner banner-error">{reportView.error}</div>}
            {reportView.report && (
              <>
                {reportView.report.ended_early && (
                  <div className="banner banner-info" style={{ marginBottom: 16 }}>
                    You left this interview early, after answering {reportView.report.answered_count}{reportView.report.planned_count ? ` of ${reportView.report.planned_count}` : ''} questions. This report is based on those answers only.
                  </div>
                )}
                <ReportView report={reportView.report} audience="candidate" />
                <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 18 }}>This is an automated evaluation to help you improve. Your admin makes the final decision.</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={17} color="var(--violet-600)" />
            <h3>Your resume</h3>
            {has_resume && <CheckCircle2 size={16} color="var(--green)" />}
          </div>
          <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
            {uploading ? <span className="spinner dark" /> : <UploadCloud size={14} />} Upload PDF / Word / text
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={onFile} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 10 }}>Upload a PDF or Word (.docx) resume and we'll extract the text automatically — or paste/edit it directly below.</p>
        {uploadError && <div className="banner banner-error" style={{ marginBottom: 10 }}>{uploadError}</div>}
        <textarea className="input" rows={12} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume text here, or upload a file above…" />
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-violet btn-sm" onClick={saveText} disabled={uploading}>{uploading ? 'Saving…' : 'Save resume'}</button>
          {notice && <span style={{ fontSize: 12.5, color: 'var(--green)' }}>{notice}</span>}
        </div>
      </div>
    </div>
  )
}
