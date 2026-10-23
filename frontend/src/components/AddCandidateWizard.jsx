import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowLeft, ArrowRight, Copy, Check, Upload, Sparkles, CheckCircle2, Mail } from 'lucide-react'
import client from '../api/client'
import { inviteText } from './stages'
import '../styles/shared.css'
import '../styles/hub.css'

const blank = {
  jd_id: '', full_name: '', email: '', resume_text: '',
  track: 'interview', mode: 'ai', difficulty: 'medium', voice_enabled: true, max_questions: 4, time_limit_minutes: '', require_fullscreen: true,
}

const emailDomainCorrections = {
  'gil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com',
}

/**
 * Add a candidate in three short steps - Who -> What -> Review & create - always inside a role.
 * Creating a Real-interview candidate also starts generating their questions; those must be
 * reviewed and approved before the interview opens.
 */
export default function AddCandidateWizard({ open, roles, presetRoleId, onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [f, setF] = useState(blank)
  const [file, setFile] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailStatus, setEmailStatus] = useState(null)

  useEffect(() => {
    if (open) {
      setStep(1); setF({ ...blank, jd_id: presetRoleId ? String(presetRoleId) : '' }); setFile(null)
      setAdvanced(false); setBusy(false); setError(''); setResult(null); setCopied(false); setEmailBusy(false); setEmailStatus(null)
    }
  }, [open, presetRoleId])

  const role = useMemo(() => (roles || []).find((r) => String(r.id) === String(f.jd_id)), [roles, f.jd_id])
  const set = (patch) => setF((p) => ({ ...p, ...patch }))

  if (!open) return null

  const onName = (v) => set({ full_name: v })
  const onEmail = (v) => {
    set({ email: v.toLowerCase() })
    if (emailErrorBanner) setError('')
  }

  const emailDomain = f.email.trim().toLowerCase().split('@')[1]
  const correctedDomain = emailDomainCorrections[emailDomain]
  const suggestedEmail = correctedDomain ? `${f.email.trim().slice(0, f.email.lastIndexOf('@') + 1)}${correctedDomain}` : ''
  const emailParts = f.email.trim().split('@')
  const emailValid = !suggestedEmail
    && f.email.trim().length <= 254
    && emailParts.length === 2
    && emailParts[0].length <= 64
    && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(f.email.trim())
  const emailError = f.email.trim()
    ? !emailValid
      ? suggestedEmail ? `Check the spelling. Did you mean ${suggestedEmail}?` : 'Enter a valid email address.'
      : ''
    : error === 'Email is required.' ? error : ''
  const emailErrorBanner = error === 'Email is required.'
    || error === 'Enter a valid email address.'
    || (suggestedEmail && error === `Check the email domain. Did you mean ${suggestedEmail}?`)
  const step1Ok = f.jd_id && f.full_name.trim() && emailValid
  const hasResume = !!file || !!f.resume_text.trim()
  const real = f.track === 'interview'

  const next = () => {
    setError('')
    if (step === 1 && !f.jd_id) { setError('Choose the role the candidate is applying for.'); return }
    if (step === 1 && !f.full_name.trim()) { setError('Candidate name is required.'); return }
    if (step === 1 && !f.email.trim()) { setError('Email is required.'); return }
    if (step === 1 && !emailValid) { setError(suggestedEmail ? `Check the email domain. Did you mean ${suggestedEmail}?` : 'Enter a valid email address.'); return }
    if (step === 1 && !hasResume) { setError('Resume is required. Upload a resume file or paste the resume text before continuing.'); return }
    if (step === 2 && real && f.mode === 'ai') {
      const maxQuestions = Number(f.max_questions)
      const timeLimit = f.time_limit_minutes === '' ? null : Number(f.time_limit_minutes)
      if (!Number.isInteger(maxQuestions) || maxQuestions < 4 || maxQuestions > 30) {
        setError('Max questions must be a positive whole number between 4 and 30.')
        return
      }
      if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 5 || timeLimit > 240)) {
        setError('Time limit must be a positive whole number between 5 and 240 minutes, or left blank for no limit.')
        return
      }
    }
    setStep((s) => s + 1)
  }

  const create = async () => {
    if (!step1Ok || !hasResume) {
      setStep(1)
      setError(!hasResume ? 'Resume is required. Upload a resume file or paste the resume text before continuing.' : suggestedEmail ? `Check the email domain. Did you mean ${suggestedEmail}?` : 'Enter the candidate name and a valid email address.')
      return
    }
    setBusy(true); setError(''); setEmailStatus(null)
    const notes = []
    try {
      const payload = new FormData()
      payload.append('full_name', f.full_name.trim())
      payload.append('email', f.email.trim())
      payload.append('jd_id', String(Number(f.jd_id)))
      payload.append('training_level', f.difficulty)
      payload.append('track', f.track)
      if (file) payload.append('file', file)
      else payload.append('resume_text', f.resume_text.trim())
      const { data } = await client.post('/admin/users', payload)
      const user = data.user
      const password = data.generated_password

      let questionsStarted = false
      if (real) {
        try {
          await client.post(`/admin/users/${user.id}/interview-config`, {
            mode: f.mode, difficulty: f.difficulty, voice_enabled: f.voice_enabled, max_questions: Number(f.max_questions) || 4, time_limit_minutes: f.mode === 'ai' && Number(f.time_limit_minutes) ? Number(f.time_limit_minutes) : null,
            require_fullscreen: f.require_fullscreen, generate_link: f.mode === 'live', link_valid_days: 3,
          })
        } catch (err) { notes.push(err?.response?.data?.error || 'Interview settings were not saved - set them on the candidate page.') }
        if (f.mode === 'ai' && hasResume) {
          try { await client.post(`/admin/users/${user.id}/interview-draft/generate`); questionsStarted = true }
          catch (err) { notes.push(err?.response?.data?.error || 'Questions could not be generated yet - retry from the candidate page.') }
        }
        if (f.mode === 'live') {
          try { await client.put(`/admin/users/${user.id}`, { track: 'interview' }) } catch { /* access can be opened on the candidate page */ }
        }
      }

      setResult({ user, password, notes, questionsStarted })
      onDone?.(user)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not create this candidate.')
      if (err?.response?.status === 409) setStep(1)
    } finally { setBusy(false) }
  }

  const cardForInvite = result && {
    name: result.user.full_name || result.user.username, username: result.user.username,
    jd_title: role?.title, mode: real ? 'real' : 'practice',
  }
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteText(cardForInvite, { password: result.password })); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* blocked */ }
  }
  const sendCredentials = async () => {
    setEmailBusy(true); setEmailStatus(null); setError('')
    try {
      const { data } = await client.post(`/admin/users/${result.user.id}/send-credentials`, { password: result.password })
      setEmailStatus(data.credential_email)
    } catch (err) {
      setEmailStatus(err?.response?.data?.credential_email || {
        status: 'failed',
        message: err?.response?.data?.error || 'Could not send credential email.',
      })
    } finally { setEmailBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-panel wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add candidate">
        <div className="modal-header">
          <div>
            <h3>{result ? 'Candidate created' : 'Add candidate'}</h3>
            {!result && <p style={{ fontSize: 12.5, marginTop: 2 }}>Step {step} of 3 - {['Who', 'What', 'Review & create'][step - 1]}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>

        {!result && <div className="wiz-steps">{[1, 2, 3].map((n) => <span key={n} className={`ws ${n <= step ? 'on' : ''}`} />)}</div>}

        {/* ---------------- Step 1: who ---------------- */}
        {!result && step === 1 && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="field"><label>Role</label>
              <select className="input" value={f.jd_id} onChange={(e) => set({ jd_id: e.target.value })} autoFocus={!presetRoleId}>
                <option value="">Choose the role they are applying for...</option>
                {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.title}{r.company ? ` - ${r.company}` : ''}</option>)}
              </select>
              {(!roles || roles.length === 0) && <p style={{ fontSize: 12, marginTop: 6, color: 'var(--red)' }}>Create a role first - every candidate belongs to one.</p>}
            </div>
            <div className="form-grid">
              <div className="field"><label>Full name <span aria-hidden="true">*</span></label><input className="input" value={f.full_name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Priya Sharma" autoFocus={!!presetRoleId} required /></div>
              <div className="field"><label>Email <span aria-hidden="true">*</span></label><input className="input" type="email" value={f.email} onChange={(e) => onEmail(e.target.value)} placeholder="priya@example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ textTransform: 'none' }} aria-invalid={!!emailError} aria-describedby={emailError ? 'candidate-email-help candidate-email-error' : 'candidate-email-help'} required /><p id="candidate-email-help" style={{ fontSize: 10.5, lineHeight: 1.35, marginTop: 3, color: 'var(--ink-faint)' }}>Use a complete address, e.g. name@example.com.</p>{emailError && <p id="candidate-email-error" role="alert" style={{ fontSize: 12, lineHeight: 1.35, marginTop: 4, color: 'var(--red)' }}>{emailError}</p>}</div>
              <div className="field"><label>Username (same as email)</label><input className="input" value={f.email} readOnly style={{ textTransform: 'none' }} /></div>
            </div>
            <div className="field">
              <label>Resume <span aria-hidden="true">*</span></label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> {file ? 'Change file' : 'Upload PDF / Word / text'}
                  <input type="file" accept=".pdf,.doc,.docx,.txt,.md" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0] || null)} />
                </label>
                {file && <span style={{ fontSize: 12.5 }}>{file.name} <button className="icon-btn" style={{ display: 'inline-flex', verticalAlign: 'middle' }} onClick={() => setFile(null)} aria-label="Remove file"><X size={13} /></button></span>}
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>or paste below</span>
              </div>
              <textarea className="input" rows={5} value={f.resume_text} disabled={!!file} onChange={(e) => set({ resume_text: e.target.value })} placeholder="Paste the resume text (skills, experience...). It is searchable and drives the interview questions." />
              <p style={{ fontSize: 11.5, marginTop: 6, color: 'var(--ink-faint)' }}>Upload a file or paste resume text to continue.</p>
            </div>
          </div>
        )}

        {/* ---------------- Step 2: what ---------------- */}
        {!result && step === 2 && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="type-pick">
              <button type="button" className={`type-opt ${f.track === 'practice' ? 'on' : ''}`} onClick={() => set({ track: 'practice' })}>
                <div className="tt">Practice</div>
                <div className="dd">The candidate prepares against the role with guided topics and self-ratings. No scored interview.</div>
              </button>
              <button type="button" className={`type-opt ${f.track === 'interview' ? 'on' : ''}`} onClick={() => set({ track: 'interview' })}>
                <div className="tt">Real interview</div>
                <div className="dd">A scored interview with a report. Questions and the final report both need your approval.</div>
              </button>
            </div>

            {real && (
              <>
                <div className="form-grid">
                  <div className="field"><label>Interview format</label>
                    <select className="input" value={f.mode} onChange={(e) => set({ mode: e.target.value })}>
                      <option value="ai">AI interviewer (voice + text)</option>
                      <option value="live">Live video call with a person</option>
                    </select>
                  </div>
                  <div className="field"><label>Difficulty</label>
                    <select className="input" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                    </select>
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setAdvanced((a) => !a)}>{advanced ? 'Hide' : 'Show'} advanced options</button>
                {advanced && (
                  <div className="form-grid">
                    {f.mode === 'ai' && <div className="field"><label>Max questions</label><input className="input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={f.max_questions} onChange={(e) => { const value = e.target.value; if (/^\d*$/.test(value)) set({ max_questions: value }) }} /></div>}
                    {f.mode === 'ai' && <div className="field"><label>Time limit (minutes)</label><select className="input" value={f.time_limit_minutes} onChange={(e) => set({ time_limit_minutes: e.target.value })}><option value="">No limit</option>{Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select><small style={{ color: 'var(--ink-faint)' }}>A countdown runs for the candidate and the interview ends when it hits zero.</small></div>}
                    {f.mode === 'ai' && <div className="field"><label>Voice</label><select className="input" value={f.voice_enabled ? 'on' : 'off'} onChange={(e) => set({ voice_enabled: e.target.value === 'on' })}><option value="on">Spoken questions</option><option value="off">Text only</option></select></div>}
                    <div className="field"><label>Fullscreen required</label><select className="input" value={f.require_fullscreen ? 'yes' : 'no'} onChange={(e) => set({ require_fullscreen: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></div>
                  </div>
                )}
                <div className="banner banner-info" style={{ marginBottom: 0 }}>
                  The candidate gets <strong>1 attempt</strong>. After you review their report you can grant one more with the <em>Re-interview</em> verdict.
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------------- Step 3: review & create ---------------- */}
        {!result && step === 3 && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="card" style={{ background: 'var(--violet-050)' }}>
              <div className="readiness-row"><span>Candidate</span><span className="readiness-value">{f.full_name} (@{f.email})</span></div>
              <div className="readiness-row"><span>Role</span><span className="readiness-value">{role?.title}</span></div>
              <div className="readiness-row"><span>Type</span><span className="readiness-value">{real ? `Real interview - ${f.mode === 'ai' ? 'AI interviewer' : 'live call'}, ${f.difficulty}` : 'Practice'}</span></div>
              <div className="readiness-row"><span className={`readiness-dot ${hasResume ? 'done' : 'warn'}`} /><span>Resume</span><span className="readiness-value">{hasResume ? (file ? file.name : 'Pasted text') : 'Not added yet'}</span></div>
            </div>
            <div>
              <div className="page-eyebrow" style={{ marginBottom: 6 }}>What happens next</div>
              <ol style={{ fontSize: 13.5, paddingLeft: 20, display: 'grid', gap: 6, color: 'var(--ink-soft)' }}>
                <li>The account is created with a one-time password for you to share.</li>
                {real && f.mode === 'ai' && (hasResume
                  ? <li>Interview questions start generating now. <strong>You review and approve them</strong> - the interview stays locked until you do.</li>
                  : <li style={{ color: '#8A5A00' }}>No resume yet, so questions cannot be generated. Add one on the candidate page to continue.</li>)}
                {real && f.mode === 'live' && <li>A join link for the live call is generated (valid for 3 days).</li>}
                {real && <li>After the interview you record a verdict before the report can be shared.</li>}
                {!real && <li>The candidate can start practising as soon as they sign in.</li>}
              </ol>
            </div>
          </div>
        )}

        {/* ---------------- Done ---------------- */}
        {result && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle2 size={22} color="var(--green)" />
              <strong style={{ fontSize: 15 }}>{result.user.full_name || result.user.username} was added to {role?.title}.</strong>
            </div>
            {result.notes.map((n, i) => <div key={i} className="banner banner-warning" style={{ marginBottom: 0 }}>{n}</div>)}
            {emailStatus && <div className={`banner ${emailStatus.status === 'sent' ? 'banner-success' : 'banner-warning'}`} style={{ marginBottom: 0 }}>{emailStatus.message}</div>}
            <div className="invite-box">{inviteText(cardForInvite, { password: result.password })}</div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>The password is shown only now - it is stored encrypted and cannot be looked up later (you can always reset it).</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-violet" onClick={copyInvite}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy invite message</>}</button>
              <button className="btn btn-outline" onClick={sendCredentials} disabled={emailBusy || !result.user.email}><Mail size={15} /> {emailBusy ? 'Sending…' : 'Send credentials by email'}</button>
              {result.questionsStarted
                ? <Link className="btn btn-ghost" to={`/admin/users/${result.user.id}?step=questions`} onClick={onClose}><Sparkles size={15} /> Review the questions</Link>
                : <Link className="btn btn-ghost" to={`/admin/users/${result.user.id}`} onClick={onClose}>Open candidate</Link>}
              <button className="btn btn-outline" onClick={() => { setStep(1); setF({ ...blank, jd_id: f.jd_id }); setFile(null); setResult(null); setEmailStatus(null); setCopied(false) }}>Add another</button>
            </div>
            {!result.user.email && <p style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Add an email address to the candidate profile before sending credentials.</p>}
          </div>
        )}

        {error && !emailErrorBanner && <div className="banner banner-error" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}

        {!result && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22 }}>
            <button className="btn btn-outline" onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))} disabled={busy}>
              {step === 1 ? 'Cancel' : <><ArrowLeft size={15} /> Back</>}
            </button>
            {step < 3
              ? <button className="btn btn-violet" onClick={next}>Next <ArrowRight size={15} /></button>
              : <button className="btn btn-violet" onClick={create} disabled={busy}>{busy ? <><span className="spinner" /> Creating...</> : 'Create candidate'}</button>}
          </div>
        )}
      </div>
    </div>
  )
}
