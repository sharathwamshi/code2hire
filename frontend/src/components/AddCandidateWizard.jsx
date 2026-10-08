import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowLeft, ArrowRight, Copy, Check, Upload, Sparkles, CheckCircle2 } from 'lucide-react'
import client from '../api/client'
import { inviteText } from './stages'
import '../styles/shared.css'
import '../styles/hub.css'

const blank = {
  jd_id: '', full_name: '', email: '', username: '', resume_text: '',
  track: 'interview', mode: 'ai', difficulty: 'medium', voice_enabled: true, max_questions: 12, time_limit_minutes: '', require_fullscreen: true,
}

const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')

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
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1); setF({ ...blank, jd_id: presetRoleId ? String(presetRoleId) : '' }); setFile(null)
      setAdvanced(false); setUsernameTouched(false); setBusy(false); setError(''); setResult(null); setCopied(false)
    }
  }, [open, presetRoleId])

  const role = useMemo(() => (roles || []).find((r) => String(r.id) === String(f.jd_id)), [roles, f.jd_id])
  const set = (patch) => setF((p) => ({ ...p, ...patch }))

  if (!open) return null

  const onName = (v) => set({ full_name: v, ...(usernameTouched ? {} : { username: slug(f.email.split('@')[0]) || slug(v) }) })
  const onEmail = (v) => set({ email: v, ...(usernameTouched ? {} : { username: slug(v.split('@')[0]) || slug(f.full_name) }) })

  const step1Ok = f.jd_id && f.full_name.trim() && f.username.trim()
  const hasResume = !!file || !!f.resume_text.trim()
  const real = f.track === 'interview'

  const next = () => {
    setError('')
    if (step === 1 && !step1Ok) { setError('Pick a role and enter the candidate\'s name and username.'); return }
    setStep((s) => s + 1)
  }

  const create = async () => {
    setBusy(true); setError('')
    const notes = []
    try {
      const { data } = await client.post('/admin/users', {
        username: f.username.trim(), full_name: f.full_name.trim(), email: f.email.trim() || null,
        jd_id: Number(f.jd_id), training_level: f.difficulty, resume_text: f.resume_text.trim() || null, track: f.track,
      })
      const user = data.user
      const password = data.generated_password

      if (file) {
        try {
          const fd = new FormData(); fd.append('file', file)
          await client.post(`/admin/users/${user.id}/resume`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch (err) { notes.push(err?.response?.data?.error || 'The resume file could not be read - add it on the candidate page.') }
      }

      let questionsStarted = false
      if (real) {
        try {
          await client.post(`/admin/users/${user.id}/interview-config`, {
            mode: f.mode, difficulty: f.difficulty, voice_enabled: f.voice_enabled, max_questions: Number(f.max_questions) || 12, time_limit_minutes: f.mode === 'ai' && Number(f.time_limit_minutes) ? Number(f.time_limit_minutes) : null,
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
              <div className="field"><label>Full name</label><input className="input" value={f.full_name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Priya Sharma" autoFocus={!!presetRoleId} /></div>
              <div className="field"><label>Email (optional)</label><input className="input" type="email" value={f.email} onChange={(e) => onEmail(e.target.value)} placeholder="priya@example.com" /></div>
              <div className="field"><label>Username</label><input className="input" value={f.username} onChange={(e) => { setUsernameTouched(true); set({ username: e.target.value }) }} placeholder="priya.sharma" /></div>
            </div>
            <div className="field">
              <label>Resume</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> {file ? 'Change file' : 'Upload PDF / Word / text'}
                  <input type="file" accept=".pdf,.doc,.docx,.txt,.md" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0] || null)} />
                </label>
                {file && <span style={{ fontSize: 12.5 }}>{file.name} <button className="icon-btn" style={{ display: 'inline-flex', verticalAlign: 'middle' }} onClick={() => setFile(null)} aria-label="Remove file"><X size={13} /></button></span>}
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>or paste below</span>
              </div>
              <textarea className="input" rows={5} value={f.resume_text} disabled={!!file} onChange={(e) => set({ resume_text: e.target.value })} placeholder="Paste the resume text (skills, experience...). It is searchable and drives the interview questions." />
              <p style={{ fontSize: 11.5, marginTop: 6, color: 'var(--ink-faint)' }}>You can add the resume later, but a real interview needs it before questions can be generated.</p>
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
                    {f.mode === 'ai' && <div className="field"><label>Max questions</label><input className="input" type="number" min={4} max={30} value={f.max_questions} onChange={(e) => set({ max_questions: e.target.value })} /></div>}
                    {f.mode === 'ai' && <div className="field"><label>Time limit (minutes)</label><input className="input" type="number" min={5} max={240} placeholder="No limit" value={f.time_limit_minutes} onChange={(e) => set({ time_limit_minutes: e.target.value })} /><small style={{ color: 'var(--ink-faint)' }}>A countdown runs for the candidate and the interview ends when it hits zero. Leave empty for no limit.</small></div>}
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
              <div className="readiness-row"><span>Candidate</span><span className="readiness-value">{f.full_name} (@{f.username})</span></div>
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
            <div className="invite-box">{inviteText(cardForInvite, { password: result.password })}</div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>The password is shown only now - it is stored encrypted and cannot be looked up later (you can always reset it).</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-violet" onClick={copyInvite}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy invite message</>}</button>
              {result.questionsStarted
                ? <Link className="btn btn-ghost" to={`/admin/users/${result.user.id}?step=questions`} onClick={onClose}><Sparkles size={15} /> Review the questions</Link>
                : <Link className="btn btn-ghost" to={`/admin/users/${result.user.id}`} onClick={onClose}>Open candidate</Link>}
              <button className="btn btn-outline" onClick={() => { setStep(1); setF({ ...blank, jd_id: f.jd_id }); setFile(null); setResult(null); setUsernameTouched(false) }}>Add another</button>
            </div>
          </div>
        )}

        {error && <div className="banner banner-error" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}

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
