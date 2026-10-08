import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Sparkles, RotateCcw, Save, Video, Mic, Copy, Check, LinkIcon, FileCheck2, Loader2, PencilLine, KeyRound, Trash2, Plus, History, X, ExternalLink, Lock, ShieldCheck, Eye } from 'lucide-react'
import client from '../../api/client'
import ReportView from '../../components/ReportView'
import ShareReportButton from '../../components/ShareReportButton'
import RecordingButton from '../../components/RecordingButton'
import ReviewPanel from '../../components/ReviewPanel'
import CandidateStepper from '../../components/CandidateStepper'
import StageChip from '../../components/StageChip'
import { STEP_FOR_STAGE, stepsFor, inviteText, verdictLabel, fmtWhen as fmtWhenShared } from '../../components/stages'
import '../../styles/shared.css'
import '../../styles/hub.css'

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const SESSION_STATUS = {
  completed: ['Completed', 'badge-completed'], in_progress: ['In progress', 'badge-inprogress'], paused: ['Paused', 'badge-paused'],
}
const fmtWhen = fmtWhenShared

export default function UserDetail() {
  const { id } = useParams()
  const [user, setUser] = useState(null)
  const [jds, setJds] = useState([])
  const [perf, setPerf] = useState(null)
  const [resumeDraft, setResumeDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [improving, setImproving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resetInfo, setResetInfo] = useState(null)
  const [form, setForm] = useState({ full_name: '', email: '', jd_id: '', training_level: 'medium', active_stage: 'prepare' })

  const [interviewConfig, setInterviewConfig] = useState(null)
  const [azureVoices, setAzureVoices] = useState([])
  const [icForm, setIcForm] = useState({
    mode: 'ai', difficulty: 'medium', voice_enabled: true, voice_id: '', max_questions: 12, time_limit_minutes: '',
    violation_threshold: 1, require_fullscreen: true, interviewer_name: '', attempts_allowed: 1,
  })
  const [icSaving, setIcSaving] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [history, setHistory] = useState(null) // null = still loading
  const [historyView, setHistoryView] = useState(null) // { row, report, loading, error }
  const [pdfBusy, setPdfBusy] = useState(false)

  const [draft, setDraft] = useState(null)
  const [draftGenerating, setDraftGenerating] = useState(false)
  const [draftApproving, setDraftApproving] = useState(false)
  const draftPollRef = useRef(null)

  const [params, setParams] = useSearchParams()
  const [st, setSt] = useState(null)               // pipeline state (stage, action, blocker...) from the backend
  const [viewing, setViewing] = useState(null)     // which step's panel is open
  const [latest, setLatest] = useState(null)       // full detail (report + review) of the latest finished interview
  const [genBusy, setGenBusy] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  const loadDraft = () => {
    client.get(`/admin/users/${id}/interview-draft`).then((r) => {
      setDraft(r.data)
      if (r.data && r.data.status === 'generating') {
        if (!draftPollRef.current) {
          draftPollRef.current = setInterval(() => {
            client.get(`/admin/users/${id}/interview-draft`).then((rr) => {
              setDraft(rr.data)
              if (!rr.data || rr.data.status !== 'generating') {
                clearInterval(draftPollRef.current)
                draftPollRef.current = null
                loadState()
              }
            })
          }, 2000)
        }
      }
    }).catch(() => setDraft(null))
  }

  useEffect(() => () => { if (draftPollRef.current) clearInterval(draftPollRef.current) }, [])

  const generateDraft = async () => {
    setDraftGenerating(true); setError(''); setNotice('')
    try {
      await client.post(`/admin/users/${id}/interview-draft/generate`)
      loadDraft(); loadState()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not start generating interview questions.')
    } finally {
      setDraftGenerating(false)
    }
  }

  const editDraftQuestion = (seq, field, value) => {
    setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.seq === seq ? { ...q, [field]: value } : q)) }))
  }

  const saveDraftQuestion = async (seq, field, value) => {
    try { await client.put(`/admin/interview-draft/${draft.id}/question/${seq}`, { [field]: value }) }
    catch (err) { setError('Could not save that edit.') }
  }

  const addDraftQuestion = async () => {
    setError(''); setNotice('')
    try {
      const { data } = await client.post(`/admin/interview-draft/${draft.id}/question`, { jd_point: 'Additional question' })
      setDraft(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not add a question.')
    }
  }

  const removeDraftQuestion = async (seq) => {
    if (!confirm('Remove this question from the draft?')) return
    setError(''); setNotice('')
    try {
      const { data } = await client.delete(`/admin/interview-draft/${draft.id}/question/${seq}`)
      setDraft(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not remove that question.')
    }
  }

  const approveDraft = async () => {
    setDraftApproving(true); setError(''); setNotice('')
    try {
      await client.post(`/admin/interview-draft/${draft.id}/approve`)
      setNotice('Questions approved. The candidate\'s interview is now open and will use exactly these questions.')
      loadDraft(); loadState(); load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not approve this draft.')
    } finally {
      setDraftApproving(false)
    }
  }

  const loadLatest = () => {
    client.get(`/admin/users/${id}/interview-history`).then((r) => {
      const done = (r.data || []).find((h) => h.status === 'completed')
      if (!done) { setLatest(null); return }
      client.get(`/admin/interview-sessions/${done.id}`).then((d) => setLatest(d.data)).catch(() => setLatest(null))
    }).catch(() => setLatest(null))
  }

  const loadState = () => client.get(`/admin/candidates/${id}/state`).then((r) => setSt(r.data)).catch(() => {})

  const load = () => {
    loadState()
    client.get(`/admin/users/${id}`).then((r) => {
      setUser(r.data)
      setResumeDraft(r.data.resume_text || '')
      setForm({ full_name: r.data.full_name || '', email: r.data.email || '', jd_id: r.data.jd_id || '', training_level: r.data.training_level || 'medium', active_stage: r.data.active_stage || 'prepare' })
    })
    client.get('/admin/jds').then((r) => setJds(r.data))
    client.get(`/admin/users/${id}/performance`).then((r) => setPerf(r.data))
    client.get(`/admin/users/${id}/interview-history`).then((r) => setHistory(r.data)).catch(() => setHistory([]))
    client.get('/admin/settings/azure-voices').then((r) => setAzureVoices(r.data)).catch(() => setAzureVoices([]))
    client.get(`/admin/users/${id}/interview-config`).then((r) => {
      if (r.data) {
        setInterviewConfig(r.data)
        setIcForm({
          mode: r.data.mode, difficulty: r.data.difficulty, voice_enabled: r.data.voice_enabled,
          voice_id: r.data.voice_id || '', max_questions: r.data.max_questions, time_limit_minutes: r.data.time_limit_minutes || '', violation_threshold: r.data.violation_threshold,
          require_fullscreen: r.data.require_fullscreen, interviewer_name: r.data.interviewer_name || '',
          attempts_allowed: r.data.attempts_allowed || 1,
        })
      }
    })
  }
  useEffect(load, [id])
  useEffect(loadLatest, [id])
  useEffect(loadDraft, [id])

  if (!user) return <p>Loading…</p>

  const saveProfile = async () => {
    setSaving(true); setError(''); setNotice('')
    try {
      await client.put(`/admin/users/${id}`, { ...form, jd_id: form.jd_id || null })
      setNotice('Profile updated.'); load()
    } catch (err) { setError(err?.response?.data?.error || 'Could not save changes.') }
    finally { setSaving(false) }
  }

  const reopenAttempt = async () => {
    setReopening(true); setError(''); setNotice('')
    try {
      const { data } = await client.post(`/admin/users/${id}/interview-attempts/reopen`)
      setIcForm((f) => ({ ...f, attempts_allowed: data.attempts_allowed }))
      setNotice('One more interview attempt has been granted.'); loadState()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not reopen the interview.')
    } finally {
      setReopening(false)
    }
  }

  const setTrack = async (track) => {
    if (user.track === track) return
    if (track === 'practice' && st?.stage !== 'profile' && !window.confirm('Switch this candidate back to Practice? They will see the preparation area instead of the interview.')) return
    setSaving(true); setError(''); setNotice('')
    try {
      await client.put(`/admin/users/${id}`, { track })
      setNotice(track === 'interview' ? 'Now a real interview candidate. The interview opens once its questions are approved.' : 'Now a practice candidate.')
      load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not change the type.')
    } finally { setSaving(false) }
  }

  const saveResume = async () => {
    setSaving(true); setError('')
    try { await client.post(`/admin/users/${id}/resume`, { resume_text: resumeDraft }); setNotice('Resume saved.'); load() }
    catch (err) { setError('Could not save resume.') }
    finally { setSaving(false) }
  }

  const onFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    setSaving(true); setError('')
    try {
      const { data } = await client.post(`/admin/users/${id}/resume`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResumeDraft(data.user.resume_text || ''); setNotice('Resume uploaded and parsed.'); load()
    } catch (err) { setError(err?.response?.data?.error || 'Could not read that file.') }
    finally { setSaving(false); e.target.value = '' }
  }

  const improveResume = async () => {
    setImproving(true); setError('')
    try { await client.post(`/admin/users/${id}/resume/improve`); setNotice('Resume streamlined for the assigned JD using Anthropic.'); load() }
    catch (err) { setError(err?.response?.data?.error || 'Could not generate an improved resume.') }
    finally { setImproving(false) }
  }

  const downloadResume = () => window.open(`/api/admin/users/${id}/resume/download?t=${Date.now()}`, '_blank')

  const resetPassword = async () => {
    if (!confirm('Generate a new password for this candidate?')) return
    const { data } = await client.put(`/admin/users/${id}`, { reset_password: true })
    setResetInfo(data.generated_password)
  }

  const saveInterviewConfig = async (extra = {}) => {
    setIcSaving(true); setError(''); setNotice('')
    try {
      const { data } = await client.post(`/admin/users/${id}/interview-config`, { ...icForm, ...extra })
      setInterviewConfig(data)
      setNotice('Interview configuration saved.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save interview configuration.')
    } finally {
      setIcSaving(false)
    }
  }

  const generateLiveLink = () => saveInterviewConfig({ generate_link: true, link_valid_days: 3 })

  const liveLinkUrl = interviewConfig?.link_token
    ? `${window.location.origin}/app/interview/live/${interviewConfig.link_token}`
    : null

  const copyLink = () => {
    navigator.clipboard.writeText(liveLinkUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  const openHistory = async (row) => {
    setHistoryView({ row, report: null, loading: !!row.report, error: '' })
    if (!row.report) return
    try {
      const { data } = await client.get(`/admin/interview-sessions/${row.id}`)
      setHistoryView({ row, report: data.report || null, loading: false, error: '' })
    } catch (err) {
      setHistoryView({ row, report: null, loading: false, error: 'Could not load this report.' })
    }
  }

  const onShareChanged = (updated) => {
    setHistoryView((v) => (v ? { ...v, report: { ...v.report, shared_with_candidate: updated.shared_with_candidate, shared_at: updated.shared_at } } : v))
    client.get(`/admin/users/${id}/interview-history`).then((r) => setHistory(r.data)).catch(() => {})
    loadState(); loadLatest()
  }

  const downloadHistoryPdf = async (row) => {
    setPdfBusy(true)
    try {
      const res = await client.get(`/admin/interview-sessions/${row.id}/report/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `interview-report-${(user.full_name || user.username).replace(/\s+/g, '-')}-${row.id}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Could not download the report PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  const latestInterview = history?.[0]
  const jdReady = !!user.jd_id
  const resumeReady = !!user.has_resume
  const questionsStatus = draft?.status || 'none'
  const latestDone = history?.find((h) => h.status === 'completed') || null

  // ---- which step is open ----
  const steps = st ? stepsFor(st.mode) : []
  const currentKey = st ? STEP_FOR_STAGE[st.stage] : null
  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === currentKey))
  const reachable = (key) => { const i = steps.findIndex((s) => s.key === key); return i !== -1 && i <= currentIdx }
  const wanted = params.get('step')
  const open = viewing && reachable(viewing) ? viewing : (wanted && reachable(wanted) ? wanted : currentKey)
  const pickStep = (key) => { setViewing(key); const p = new URLSearchParams(params); p.set('step', key); setParams(p, { replace: true }) }

  const generateReportNow = async () => {
    if (!latestDone) return
    setGenBusy(true); setError(''); setNotice('')
    try {
      await client.post(`/admin/interview-sessions/${latestDone.id}/generate-report`, {})
      setNotice('Report generated. Read it, then record your decision.')
      load(); loadLatest()
    } catch (err) { setError(err?.response?.data?.error || 'Could not generate the report.') } finally { setGenBusy(false) }
  }

  const copyInvite = async () => {
    const card = { name: user.full_name || user.username, username: user.username, jd_title: user.jd_title, mode: st?.mode || 'practice' }
    try { await navigator.clipboard.writeText(inviteText(card, { password: resetInfo })); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1800) } catch { /* clipboard blocked */ }
  }

  const real = st?.mode === 'real'
  const latestReport = latest?.report || null
  const latestReview = latest?.review || null
  const attemptsUsed = st?.attempts_used ?? 0
  const attemptsAllowed = st?.attempts_allowed ?? icForm.attempts_allowed
  const exhausted = attemptsUsed >= attemptsAllowed

  const attemptsCard = real && icForm.mode === 'ai' && (
    <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Interview attempts</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: exhausted ? 'var(--red)' : 'var(--ink)' }}>{attemptsUsed} of {attemptsAllowed} used</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 4 }}>
          {exhausted
            ? 'No attempts left. To allow another one, record a Re-interview verdict on the Review step.'
            : `The candidate can still take ${attemptsAllowed - attemptsUsed} more attempt${attemptsAllowed - attemptsUsed === 1 ? '' : 's'}.`}
        </p>
      </div>
      <button className="btn btn-outline btn-sm" onClick={reopenAttempt} disabled={reopening || !exhausted || (latestDone && !latestDone.review)}
        title={latestDone && !latestDone.review ? 'Review the latest interview first' : undefined}>
        {reopening ? <span className="spinner dark" /> : <RotateCcw size={14} />} Grant one more attempt
      </button>
    </div>
  )

  return (
    <div>
      <Link to={user.jd_id ? `/admin/roles/${user.jd_id}` : '/admin/users'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--ink-faint)', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={15} /> {user.jd_id ? `Back to ${user.jd_title || 'role'}` : 'Back to candidates'}
      </Link>

      <div className="page-header">
        <div>
          <span className="page-eyebrow">Candidate</span>
          <h1 className="page-title">{user.full_name || user.username}</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            @{user.username} · {user.jd_title || 'No role assigned'} {st && <StageChip stage={st.stage} />}
          </p>
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>This candidate is doing</div>
          <div className="segmented" role="group" aria-label="Candidate type">
            <button className={user.track !== 'interview' ? 'active' : ''} onClick={() => setTrack('practice')} disabled={saving}>Practice</button>
            <button className={user.track === 'interview' ? 'active' : ''} onClick={() => setTrack('interview')} disabled={saving}>Real interview</button>
          </div>
        </div>
      </div>

      {notice && <div className="banner banner-success">{notice}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {!st ? <p>Loading...</p> : (
        <>
          <CandidateStepper state={st} viewing={open} onPick={pickStep} />

          {st.action && open !== currentKey && (
            <div className="next-up">
              <div><div className="k">Next up</div><div className="v">{st.stage_label}</div>{st.blocker && <div className="w">{st.blocker}</div>}</div>
              <button className="btn btn-violet btn-sm" onClick={() => pickStep(currentKey)}>Go to this step</button>
            </div>
          )}
          {st.action && open === currentKey && st.blocker && (
            <div className="next-up">
              <div><div className="k">What is needed now</div><div className="v">{st.blocker}</div></div>
            </div>
          )}

          {/* =============== PROFILE =============== */}
          {open === 'profile' && (
            <>
              {!resumeReady && <div className="banner banner-warning">Add a resume to continue - the next steps stay locked until there is one.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Profile &amp; assignment</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field"><label>Full name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Assigned JD</label>
              <select className="input" value={form.jd_id} onChange={(e) => setForm({ ...form, jd_id: e.target.value })}>
                <option value="">— Unassigned —</option>
                {jds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
              </select>
            </div>
            <div className="field"><label>Training level (prep flow)</label>
              <select className="input" value={form.training_level} onChange={(e) => setForm({ ...form, training_level: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <button className="btn btn-violet" style={{ justifySelf: 'start' }} onClick={saveProfile} disabled={saving}><Save size={15} /> Save profile</button>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <KeyRound size={18} color="var(--violet-600)" />
            <h3>Credentials &amp; access</h3>
          </div>

          <div style={{ display: 'grid', gap: 0, marginBottom: 14 }}>
            <div className="readiness-row"><span>Username</span><span className="readiness-value mono">@{user.username}</span></div>
            <div className="readiness-row"><span>User ID</span><span className="readiness-value mono">#{user.id}</span></div>
          </div>

          {resetInfo ? (
            <div className="banner banner-info" style={{ marginBottom: 12 }}>
              New password: <strong className="mono">{resetInfo}</strong> — share this with the candidate now. It won't be shown again.
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginBottom: 12 }}>Passwords are encrypted and can't be viewed later — reset to issue a new one.</p>
          )}
          <button className="btn btn-outline btn-sm" onClick={resetPassword}><RotateCcw size={14} /> Reset password</button>
        </div>
              </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3>Resume</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
              Upload PDF / Word / text
              <input type="file" accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-ghost btn-sm" onClick={improveResume} disabled={improving || !user.jd_id}>
              {improving ? <span className="spinner dark" /> : <Sparkles size={14} />} Streamline for JD
            </button>
            <button className="btn btn-violet btn-sm" onClick={downloadResume} disabled={!user.has_resume}><Download size={14} /> Download</button>
          </div>
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 10 }}>"Streamline for JD" reorders and tightens the existing resume content around the assigned JD — it won't invent new experience.</p>
        <textarea className="input" rows={14} value={resumeDraft} onChange={(e) => setResumeDraft(e.target.value)} placeholder="Paste or upload the candidate's resume text here…" />
        <div style={{ marginTop: 10 }}><button className="btn btn-outline btn-sm" onClick={saveResume} disabled={saving}>Save resume text</button></div>
        {user.resume_updated_text && (
          <div style={{ marginTop: 20 }}>
            <div className="page-eyebrow" style={{ marginBottom: 8 }}>Streamlined version (latest)</div>
            <div className="card" style={{ background: 'var(--violet-050)', maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{user.resume_updated_text}</div>
          </div>
        )}
      </div>
            </>
          )}

          {/* =============== PRACTICE =============== */}
          {open === 'practice' && (
            <>
              <div className="banner banner-info">This candidate is on the <strong>Practice</strong> track: they prepare with guided topics and self-ratings. Switch them to <em>Real interview</em> above when you are ready to assess them.</div>
              <div className="stat-grid">
                <div className="stat-card"><span className="stat-label">Logins</span><span className="stat-value">{perf?.login_count ?? '—'}</span></div>
                <div className="stat-card"><span className="stat-label">Time spent</span><span className="stat-value">{perf ? formatDuration(perf.total_time_seconds) : '—'}</span></div>
                <div className="stat-card"><span className="stat-label">Self-rating avg</span><span className="stat-value">{perf?.avg_self_rating != null ? `${perf.avg_self_rating}/5` : '—'}</span></div>
                <div className="stat-card"><span className="stat-label">Prep sessions</span><span className="stat-value">{perf?.prep_flows_generated ?? '—'}</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Self-assessment feedback</h3>
          <p style={{ fontSize: 13, marginBottom: 12 }}>Topics the candidate has rated their own knowledge on, most recent first.</p>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {(!perf?.feedback || perf.feedback.length === 0) && <p style={{ fontSize: 13 }}>No feedback submitted yet.</p>}
            {perf?.feedback.map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <div><div style={{ fontSize: 13.5, fontWeight: 500 }}>{f.topic}</div>{f.comments && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{f.comments}</div>}</div>
                <span className="badge badge-neutral">{f.self_rating}/5</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <KeyRound size={18} color="var(--violet-600)" />
            <h3>Credentials &amp; access</h3>
          </div>

          <div style={{ display: 'grid', gap: 0, marginBottom: 14 }}>
            <div className="readiness-row"><span>Username</span><span className="readiness-value mono">@{user.username}</span></div>
            <div className="readiness-row"><span>User ID</span><span className="readiness-value mono">#{user.id}</span></div>
          </div>

          {resetInfo ? (
            <div className="banner banner-info" style={{ marginBottom: 12 }}>
              New password: <strong className="mono">{resetInfo}</strong> — share this with the candidate now. It won't be shown again.
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginBottom: 12 }}>Passwords are encrypted and can't be viewed later — reset to issue a new one.</p>
          )}
          <button className="btn btn-outline btn-sm" onClick={resetPassword}><RotateCcw size={14} /> Reset password</button>
        </div>
              </div>
            </>
          )}

          {/* =============== QUESTIONS (setup + approval gate) =============== */}
          {open === 'questions' && (
            <>
              {icForm.mode === 'ai' && questionsStatus !== 'approved' && (
                <div className="banner banner-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Lock size={15} /> The interview stays locked until you approve the questions below.</div>
              )}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Video size={18} color="var(--violet-600)" />
          <h3>Interview configuration</h3>
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 16 }}>
          Controls how this candidate's live interview runs — whether it's AI-conducted or a live video
          call, how sharp the questions are, and the integrity policy while it's in progress.
        </p>

        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field"><label>Interview mode</label>
            <select className="input" value={icForm.mode} onChange={(e) => setIcForm({ ...icForm, mode: e.target.value })}>
              <option value="ai">AI-conducted (voice + text)</option>
              <option value="live">Live video call with a human interviewer</option>
            </select>
          </div>
          <div className="field"><label>Difficulty</label>
            <select className="input" value={icForm.difficulty} onChange={(e) => setIcForm({ ...icForm, difficulty: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>

          {icForm.mode === 'ai' && (
            <>
              <div className="field"><label>Max questions</label>
                <input className="input" type="number" min={4} max={30} value={icForm.max_questions} onChange={(e) => setIcForm({ ...icForm, max_questions: Number(e.target.value) })} />
              </div>
              <div className="field"><label>Time limit (minutes)</label>
                <input className="input" type="number" min={5} max={240} placeholder="No limit" value={icForm.time_limit_minutes} onChange={(e) => setIcForm({ ...icForm, time_limit_minutes: e.target.value })} />
                <small style={{ color: 'var(--ink-faint)' }}>Shown as a countdown to the candidate. The interview ends when it reaches zero. Leave empty for no limit.</small>
              </div>
              <div className="field"><label>Voice</label>
                <select className="input" value={icForm.voice_enabled ? 'on' : 'off'} onChange={(e) => setIcForm({ ...icForm, voice_enabled: e.target.value === 'on' })}>
                  <option value="on">Voice + text (spoken questions)</option>
                  <option value="off">Text only</option>
                </select>
              </div>
              {icForm.voice_enabled && (
                <div className="field"><label>Voice name (Azure)</label>
                  <select className="input" value={icForm.voice_id} onChange={(e) => setIcForm({ ...icForm, voice_id: e.target.value })}>
                    <option value="">Default (Ava, US)</option>
                    {azureVoices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {icForm.mode === 'live' && (
            <div className="field"><label>Interviewer name</label>
              <input className="input" value={icForm.interviewer_name} onChange={(e) => setIcForm({ ...icForm, interviewer_name: e.target.value })} placeholder="e.g. Deepak" />
            </div>
          )}

          <div className="field"><label>Violation threshold (before high-risk flag)</label>
            <input className="input" type="number" min={1} max={10} value={icForm.violation_threshold} onChange={(e) => setIcForm({ ...icForm, violation_threshold: Number(e.target.value) })} />
          </div>
          <div className="field"><label>Require fullscreen</label>
            <select className="input" value={icForm.require_fullscreen ? 'yes' : 'no'} onChange={(e) => setIcForm({ ...icForm, require_fullscreen: e.target.value === 'yes' })}>
              <option value="yes">Yes — exiting fullscreen is a violation</option>
              <option value="no">No — fullscreen not required</option>
            </select>
          </div>
        </div>

        <div className="banner banner-warning" style={{ marginBottom: 16 }}>
          <strong>Integrity lock:</strong> if the candidate switches tabs, loses window focus, exits
          fullscreen, opens dev tools, or pastes into an answer, the interview pauses immediately and
          can only be resumed or restarted by an admin — never automatically.
        </div>

        {icForm.mode === 'ai' && icForm.voice_enabled && (
          <div className="banner banner-info" style={{ marginBottom: 16 }}>
            Voice uses Azure Speech if configured under <strong>Settings</strong> — otherwise it
            automatically falls back to the candidate's browser's built-in voice.
          </div>
        )}

        <button className="btn btn-violet" onClick={() => saveInterviewConfig()} disabled={icSaving}>
          {icSaving ? <span className="spinner" /> : <Save size={15} />} Save interview settings
        </button>

        {icForm.mode === 'live' && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <LinkIcon size={16} color="var(--violet-600)" />
              <strong style={{ fontSize: 14 }}>Candidate join link</strong>
            </div>
            {liveLinkUrl ? (
              <div className="card" style={{ background: 'var(--violet-050)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{liveLinkUrl}</span>
                <button className="icon-btn" onClick={copyLink}>{linkCopied ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
            ) : (
              <p style={{ fontSize: 13 }}>No active link yet.</p>
            )}
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={generateLiveLink} disabled={icSaving}>
              {liveLinkUrl ? 'Generate a new link (invalidates the old one)' : 'Generate join link'}
            </button>
            <p style={{ fontSize: 11.5, marginTop: 8, color: 'var(--ink-faint)' }}>Links expire after 3 days.</p>
          </div>
        )}
      </div>
              {icForm.mode === 'ai' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FileCheck2 size={18} color="var(--violet-600)" />
            <h3>Interview question draft</h3>
          </div>
          <p style={{ fontSize: 12.5, marginBottom: 16 }}>
            Pre-generate the candidate's interview questions here, review and edit them, then approve.
            Once approved, the candidate's actual interview serves these questions <strong>instantly</strong> —
            no live AI call happens while they're waiting, so there's no delay or blank-loading during
            their real interview.
          </p>

          {!draft && (
            <button className="btn btn-violet btn-sm" onClick={generateDraft} disabled={draftGenerating || !user.jd_id || !user.has_resume}>
              {draftGenerating ? <span className="spinner" /> : <Sparkles size={14} />} Generate draft questions
            </button>
          )}
          {!draft && (!user.jd_id || !user.has_resume) && (
            <p style={{ fontSize: 11.5, marginTop: 8, color: 'var(--red)' }}>Assign a JD and add a resume first.</p>
          )}

          {draft && draft.status === 'generating' && (
            <div>
              <div style={{ maxWidth: 320, marginBottom: 12, height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'var(--violet-600)', width: `${(draft.questions_done / draft.total_topics) * 100}%`, transition: 'width 0.5s ease' }} />
              </div>
              <p style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} className="spin" /> Generating… {draft.questions_done} of {draft.total_topics} questions ready
              </p>
            </div>
          )}

          {draft && (draft.status === 'ready' || draft.status === 'approved') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className={`badge ${draft.status === 'approved' ? 'badge-completed' : 'badge-medium'}`}>
                  {draft.status === 'approved' ? 'Approved — live' : 'Ready for review'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={generateDraft} disabled={draftGenerating}>
                    <RotateCcw size={13} /> Regenerate
                  </button>
                  {draft.status === 'ready' && (
                    <button className="btn btn-violet btn-sm" onClick={approveDraft} disabled={draftApproving}>
                      {draftApproving ? <span className="spinner" /> : <Check size={13} />} Approve & use for interview
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {draft.questions.map((q) => (
                  <div key={q.seq} className="card" style={{ background: 'var(--surface)', padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="badge badge-neutral">{q.jd_point}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {q.found_in_resume
                          ? <span className="badge badge-low">on resume</span>
                          : <span className="badge badge-medium">not on resume</span>}
                        {draft.status !== 'approved' && (
                          <button className="icon-btn" title="Remove this question" onClick={() => removeDraftQuestion(q.seq)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 4 }}>OPENING QUESTION</label>
                    <textarea
                      className="input" rows={2} style={{ fontSize: 13, marginBottom: 10 }}
                      value={q.opening_question}
                      disabled={draft.status === 'approved'}
                      onChange={(e) => editDraftQuestion(q.seq, 'opening_question', e.target.value)}
                      onBlur={(e) => saveDraftQuestion(q.seq, 'opening_question', e.target.value)}
                    />
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 4 }}>FOLLOW-UP QUESTION</label>
                    <textarea
                      className="input" rows={2} style={{ fontSize: 13 }}
                      value={q.follow_up_question}
                      disabled={draft.status === 'approved'}
                      onChange={(e) => editDraftQuestion(q.seq, 'follow_up_question', e.target.value)}
                      onBlur={(e) => saveDraftQuestion(q.seq, 'follow_up_question', e.target.value)}
                    />
                    {q.edited && <div style={{ fontSize: 10.5, color: 'var(--violet-600)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><PencilLine size={11} /> Edited by admin</div>}
                  </div>
                ))}
              </div>

              {draft.status !== 'approved' && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={addDraftQuestion}>
                  <Plus size={14} /> Add question
                </button>
              )}
            </div>
          )}

          {draft && draft.status === 'failed' && (
            <div className="banner banner-error">
              Generation failed: {draft.error_message}
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={generateDraft} disabled={draftGenerating}>Try again</button>
              </div>
            </div>
          )}
        </div>
              )}
            </>
          )}

          {/* =============== INTERVIEW =============== */}
          {open === 'interview' && (
            <>
              {attemptsCard}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Mic size={18} color="var(--violet-600)" /><h3>Invite the candidate</h3></div>
                  <div className="readiness-row"><span className="readiness-dot done" /><span>Questions</span><span className="readiness-value">{icForm.mode === 'live' ? 'Live call - no question set' : 'Approved'}</span></div>
                  <div className="readiness-row"><span className={`readiness-dot ${st.access === 'interview' ? 'done' : 'warn'}`} /><span>Interview opens at sign-in</span><span className="readiness-value">{st.access === 'interview' ? 'Yes' : 'Not yet'}</span></div>
                  <div className="readiness-row"><span>Username</span><span className="readiness-value mono">@{user.username}</span></div>
                  {icForm.mode === 'live' && liveLinkUrl && <div className="readiness-row"><span>Join link</span><span className="readiness-value mono" style={{ wordBreak: 'break-all' }}>{liveLinkUrl}</span></div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn btn-violet btn-sm" onClick={copyInvite}>{inviteCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy invite message</>}</button>
                    <button className="btn btn-outline btn-sm" onClick={resetPassword}><RotateCcw size={14} /> Reset password</button>
                    {icForm.mode === 'live' && liveLinkUrl && <button className="btn btn-outline btn-sm" onClick={copyLink}>{linkCopied ? <Check size={14} /> : <LinkIcon size={14} />} Copy join link</button>}
                  </div>
                  {resetInfo && <div className="banner banner-info" style={{ marginTop: 12, marginBottom: 0 }}>New password: <strong className="mono">{resetInfo}</strong> - included in the invite message you copy now. It will not be shown again.</div>}
                </div>
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Eye size={18} color="var(--violet-600)" /><h3>Status</h3></div>
                  {st.stage === 'live' ? (
                    <>
                      <p style={{ fontSize: 13.5, marginBottom: 12 }}>{st.paused ? 'The interview is paused and waiting for you.' : 'The candidate is interviewing right now.'}</p>
                      {st.session_id && <Link to={`/admin/interview-sessions/${st.session_id}`} className="btn btn-violet btn-sm"><Eye size={14} /> Watch live</Link>}
                    </>
                  ) : (
                    <p style={{ fontSize: 13.5 }}>{st.sub === 're_interview' ? 'A re-interview was granted - the candidate can start another attempt.' : 'Waiting for the candidate to sign in and start. You will be notified when they finish.'}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* =============== REVIEW =============== */}
          {open === 'review' && (
            <>
              {!latestDone ? (
                <div className="card empty-state"><h3>No finished interview yet</h3><p>Once the candidate completes an interview, its report appears here for your review.</p></div>
              ) : (
                <>
                  {!latestReport && (
                    <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div><h3>Generate the report</h3><p style={{ fontSize: 13, marginTop: 4 }}>The interview is finished. Generate the evaluation report, then read it and record your decision.</p></div>
                      <button className="btn btn-violet" onClick={generateReportNow} disabled={genBusy}>{genBusy ? <span className="spinner" /> : <Sparkles size={15} />} Generate report</button>
                    </div>
                  )}
                  <div style={{ marginBottom: 20 }}>
                    <ReviewPanel sessionId={latestDone.id} completed hasReport={!!latestReport} review={latestReview}
                      onSaved={(r) => { setViewing('review'); setNotice(r?.attempt_granted ? 'Review saved - one more attempt granted. The candidate can interview again.' : 'Review saved. You can now share the report from the Share step.'); load(); loadLatest() }} />
                  </div>
                  {latestReport && (
                    <div className="card" style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                        <h3>Report · {fmtWhen(latestDone.completed_at || latestDone.started_at)}</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {latestDone.recording_path && <RecordingButton sessionId={latestDone.id} />}
                          <Link to={`/admin/interview-sessions/${latestDone.id}`} className="btn btn-outline btn-sm"><ExternalLink size={14} /> Full session</Link>
                          <button className="btn btn-outline btn-sm" onClick={() => downloadHistoryPdf(latestDone)} disabled={pdfBusy}>{pdfBusy ? <span className="spinner dark" /> : <Download size={14} />} PDF</button>
                          <button className="btn btn-ghost btn-sm" onClick={generateReportNow} disabled={genBusy}>{genBusy ? <span className="spinner dark" /> : <Sparkles size={14} />} Regenerate</button>
                        </div>
                      </div>
                      <ReportView report={latestReport} audience="admin" review={latestReview} name={user.full_name || user.username} subtitle={[user.jd_title, latestDone.mode === 'ai' ? 'AI interview' : null].filter(Boolean).join(' · ')} />
                    </div>
                  )}
                </>
              )}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <History size={18} color="var(--violet-600)" />
          <h3>All interviews</h3>
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 16 }}>Every interview this candidate has taken, newest first. Click a row to see its report.</p>

        {history === null ? <p style={{ fontSize: 13 }}>Loading…</p> : history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No interviews yet. Once {user.full_name?.split(' ')[0] || user.username} takes one, it and its report will appear here.</p>
        ) : (
          <div style={{ overflowX: 'auto', margin: '0 -14px' }}>
            <table className="data-table">
              <thead><tr><th>When</th><th>Type</th><th>Status</th><th>Answered</th><th>Integrity</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => {
                  const [statusLabel, statusClass] = SESSION_STATUS[h.status] || [h.status, 'badge-neutral']
                  return (
                    <tr key={h.id} className="clickable-row" onClick={() => openHistory(h)}>
                      <td className="mono">{fmtWhen(h.completed_at || h.started_at)}</td>
                      <td>
                        <span className="badge badge-neutral">{h.mode === 'ai' ? 'AI interview' : 'Live call'}</span>
                        {h.recording_path && <Video size={13} color="var(--violet-600)" style={{ marginLeft: 6, verticalAlign: 'middle' }} title="Recording available" />}
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`}>{statusLabel}</span>
                        {h.end_reason === 'candidate_exit' && <span className="badge badge-medium" style={{ marginLeft: 6 }}>Ended early</span>}
                    {h.end_reason === 'time_up' && <span className="badge badge-medium" style={{ marginLeft: 6 }}>Time up</span>}
                      </td>
                      <td>{h.mode === 'ai' ? `${h.answered_count}${h.planned_count ? ` of ${h.planned_count}` : ''}` : '—'}</td>
                      <td>
                        {h.violation_count > 0
                          ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{h.violation_count} violation{h.violation_count === 1 ? '' : 's'}</span>
                          : <span style={{ color: 'var(--ink-faint)' }}>Clean</span>}
                        {h.notice_count > 0 && <div style={{ color: 'var(--ink-faint)', fontSize: 11.5 }}>{h.notice_count} focus notice{h.notice_count === 1 ? '' : 's'}</div>}
                      </td>
                      <td>
                        {h.report ? (
                          <div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{h.report.overall_score}/5</strong>
                              <span className="badge badge-neutral">{h.report.verdict}</span>
                              <span className={`badge ${h.report.recommendation === 'Selected' ? 'badge-completed' : h.report.recommendation === 'Rejected' ? 'badge-paused' : 'badge-medium'}`}>{h.report.recommendation}</span>
                            </span>
                            <div style={{ fontSize: 11.5, marginTop: 4, color: h.report.shared_with_candidate ? 'var(--green)' : 'var(--ink-faint)' }}>
                              {h.report.shared_with_candidate ? 'Shared with candidate' : 'Not shared with candidate'}
                            </div>
                            <div style={{ marginTop: 4 }}>{h.review ? <span className={`verdict-pill ${h.review.verdict}`}>{verdictLabel(h.review.verdict)}</span> : h.status === 'completed' ? <span className="stage-chip tone-awaiting_review"><span className="dot" />Awaiting review</span> : null}</div>
                          </div>
                        ) : <span style={{ color: 'var(--ink-faint)' }}>{h.status === 'completed' ? 'Report pending' : '—'}</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Link to={`/admin/interview-sessions/${h.id}`} className="icon-btn" style={{ textDecoration: 'none' }} title="Open full session"><ExternalLink size={15} /></Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
            </>
          )}

          {/* =============== SHARE =============== */}
          {open === 'share' && (
            <>
              {attemptsCard}
              {latestDone && latestReport ? (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><ShieldCheck size={18} color="var(--violet-600)" /><h3>Share with the candidate</h3></div>
                  <div className="readiness-row"><span>Score</span><span className="readiness-value"><strong>{latestReport.overall_score}/5</strong> · {latestReport.verdict}</span></div>
                  <div className="readiness-row"><span>Your decision</span><span className="readiness-value">{latestReview ? <span className={`verdict-pill ${latestReview.verdict}`}>{verdictLabel(latestReview.verdict)}</span> : 'Not reviewed'}</span></div>
                  {latestReview?.note && <div className="readiness-row"><span>Note</span><span className="readiness-value" style={{ maxWidth: 420 }}>{latestReview.note}</span></div>}
                  {latestReview && <div className="readiness-row"><span>Reviewed by</span><span className="readiness-value">{latestReview.reviewer_name || 'an admin'} · {fmtWhen(latestReview.reviewed_at)}</span></div>}
                  <div style={{ background: 'var(--violet-050)', borderRadius: 10, padding: '12px 14px', margin: '16px 0', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {latestReport.shared_with_candidate
                      ? 'The candidate can see the evaluation (score, strengths, Q&A) on their dashboard. Your decision, note and recommendation stay private to you.'
                      : 'Only you can see this report. The candidate cannot see it until you share it. Your decision and note are never shown to them.'}
                  </div>
                  <ShareReportButton sessionId={latestDone.id} shared={latestReport.shared_with_candidate} locked={!latestReview} onChanged={() => { loadState(); loadLatest(); load() }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => pickStep('review')}>Change decision</button>
                    <button className="btn btn-outline btn-sm" onClick={() => downloadHistoryPdf(latestDone)} disabled={pdfBusy}><Download size={14} /> Download PDF</button>
                  </div>
                </div>
              ) : <div className="card empty-state"><h3>Nothing to share yet</h3><p>Review a finished interview first.</p></div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <History size={18} color="var(--violet-600)" />
          <h3>All interviews</h3>
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 16 }}>Every interview this candidate has taken, newest first. Click a row to see its report.</p>

        {history === null ? <p style={{ fontSize: 13 }}>Loading…</p> : history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No interviews yet. Once {user.full_name?.split(' ')[0] || user.username} takes one, it and its report will appear here.</p>
        ) : (
          <div style={{ overflowX: 'auto', margin: '0 -14px' }}>
            <table className="data-table">
              <thead><tr><th>When</th><th>Type</th><th>Status</th><th>Answered</th><th>Integrity</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => {
                  const [statusLabel, statusClass] = SESSION_STATUS[h.status] || [h.status, 'badge-neutral']
                  return (
                    <tr key={h.id} className="clickable-row" onClick={() => openHistory(h)}>
                      <td className="mono">{fmtWhen(h.completed_at || h.started_at)}</td>
                      <td>
                        <span className="badge badge-neutral">{h.mode === 'ai' ? 'AI interview' : 'Live call'}</span>
                        {h.recording_path && <Video size={13} color="var(--violet-600)" style={{ marginLeft: 6, verticalAlign: 'middle' }} title="Recording available" />}
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`}>{statusLabel}</span>
                        {h.end_reason === 'candidate_exit' && <span className="badge badge-medium" style={{ marginLeft: 6 }}>Ended early</span>}
                    {h.end_reason === 'time_up' && <span className="badge badge-medium" style={{ marginLeft: 6 }}>Time up</span>}
                      </td>
                      <td>{h.mode === 'ai' ? `${h.answered_count}${h.planned_count ? ` of ${h.planned_count}` : ''}` : '—'}</td>
                      <td>
                        {h.violation_count > 0
                          ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{h.violation_count} violation{h.violation_count === 1 ? '' : 's'}</span>
                          : <span style={{ color: 'var(--ink-faint)' }}>Clean</span>}
                        {h.notice_count > 0 && <div style={{ color: 'var(--ink-faint)', fontSize: 11.5 }}>{h.notice_count} focus notice{h.notice_count === 1 ? '' : 's'}</div>}
                      </td>
                      <td>
                        {h.report ? (
                          <div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong>{h.report.overall_score}/5</strong>
                              <span className="badge badge-neutral">{h.report.verdict}</span>
                              <span className={`badge ${h.report.recommendation === 'Selected' ? 'badge-completed' : h.report.recommendation === 'Rejected' ? 'badge-paused' : 'badge-medium'}`}>{h.report.recommendation}</span>
                            </span>
                            <div style={{ fontSize: 11.5, marginTop: 4, color: h.report.shared_with_candidate ? 'var(--green)' : 'var(--ink-faint)' }}>
                              {h.report.shared_with_candidate ? 'Shared with candidate' : 'Not shared with candidate'}
                            </div>
                            <div style={{ marginTop: 4 }}>{h.review ? <span className={`verdict-pill ${h.review.verdict}`}>{verdictLabel(h.review.verdict)}</span> : h.status === 'completed' ? <span className="stage-chip tone-awaiting_review"><span className="dot" />Awaiting review</span> : null}</div>
                          </div>
                        ) : <span style={{ color: 'var(--ink-faint)' }}>{h.status === 'completed' ? 'Report pending' : '—'}</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Link to={`/admin/interview-sessions/${h.id}`} className="icon-btn" style={{ textDecoration: 'none' }} title="Open full session"><ExternalLink size={15} /></Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
            </>
          )}
        </>
      )}

      {historyView && (
        <div className="modal-overlay" onClick={() => setHistoryView(null)}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Interview · {fmtWhen(historyView.row.completed_at || historyView.row.started_at)}</h3>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-neutral">{historyView.row.mode === 'ai' ? 'AI interview' : 'Live call'}</span>
                  <span className={`badge ${(SESSION_STATUS[historyView.row.status] || [])[1] || 'badge-neutral'}`}>{(SESSION_STATUS[historyView.row.status] || [historyView.row.status])[0]}</span>
                  {historyView.row.end_reason === 'candidate_exit' && (
                    <span className="badge badge-medium">Ended early · {historyView.row.answered_count}{historyView.row.planned_count ? ` of ${historyView.row.planned_count}` : ''} answered</span>
                  )}
                  {historyView.row.violation_count > 0 && <span className="badge badge-high">{historyView.row.violation_count} violation{historyView.row.violation_count === 1 ? '' : 's'}</span>}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setHistoryView(null)} aria-label="Close"><X size={18} /></button>
            </div>

            {historyView.loading && <p style={{ fontSize: 13 }}>Loading report…</p>}
            {historyView.error && <div className="banner banner-error">{historyView.error}</div>}
            {historyView.report && <ReportView report={historyView.report} audience="admin" review={historyView.row.review} name={user.full_name || user.username} subtitle={user.jd_title || ''} />}
            {!historyView.loading && !historyView.error && !historyView.report && (
              <div className="banner banner-info">
                {historyView.row.status === 'completed'
                  ? 'No report has been generated for this interview yet. Open the full session to generate one.'
                  : 'This interview has not finished, so there is no report yet.'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <div>
                {historyView.report && (
                  <ShareReportButton sessionId={historyView.row.id} shared={historyView.report.shared_with_candidate} locked={!historyView.row.review} onChanged={onShareChanged} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
              {historyView.row.recording_path && <RecordingButton sessionId={historyView.row.id} />}
              <Link to={`/admin/interview-sessions/${historyView.row.id}`} className="btn btn-outline btn-sm"><ExternalLink size={14} /> Open full session</Link>
              {historyView.report && (
                <button className="btn btn-violet btn-sm" onClick={() => downloadHistoryPdf(historyView.row)} disabled={pdfBusy}>
                  {pdfBusy ? <span className="spinner" /> : <Download size={14} />} Download PDF
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
