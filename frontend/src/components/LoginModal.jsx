import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Sparkles, ClipboardCheck, Eye, EyeOff, ArrowRight, AlertCircle, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './LoginModal.css'

// Two doors, named after the story on the landing page: people who are preparing
// (candidates) and people who are hiring (recruiters, i.e. the admin role).
const PORTALS = {
  candidate: {
    role: 'candidate',
    tab: "I'm preparing", who: 'Candidate',
    icon: Sparkles,
    lead: 'Practice it.', grad: 'Then prove it.',
    sub: 'Sign in with the username and password your recruiter shared with you.',
    userLabel: 'Your username', userHint: 'e.g. priya.sharma',
    cta: 'Continue to my interview',
    steps: ['Practice', 'Interview', 'Results'],
    foot: 'No account yet? Your recruiter creates it for you.',
  },
  recruiter: {
    role: 'admin',
    tab: "I'm hiring", who: 'Recruiter',
    icon: ClipboardCheck,
    lead: 'Hire on proof,', grad: 'not on a hunch.',
    sub: 'Sign in to your roles, reviews and reports.',
    userLabel: 'Recruiter username', userHint: 'your username',
    cta: 'Open my workspace',
    steps: ['Review', 'Decide', 'Share'],
    foot: 'Every report is reviewed by a person before it is shared.',
  },
}
const ORDER = ['candidate', 'recruiter']
const portalForRole = (role) => (role === 'admin' ? 'recruiter' : 'candidate')

export default function LoginModal({ onClose, initialRole = 'candidate' }) {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [portal, setPortal] = useState(initialRole === 'admin' || initialRole === 'recruiter' ? 'recruiter' : 'candidate')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const userRef = useRef(null)
  const cfg = PORTALS[portal]

  useEffect(() => { userRef.current?.focus() }, [portal])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, loading])

  const pick = (key) => { setPortal(key); setError(''); setNotice('') }

  // Arrow keys move between the two tabs, as in any tab list.
  const onTabKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    pick(portal === 'candidate' ? 'recruiter' : 'candidate')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setNotice('')
    try {
      const user = await login(username, password, cfg.role)
      navigate(user.role === 'admin' ? '/admin' : '/app')
    } catch (err) {
      if (err?.code === 'wrong_portal') {
        // Right credentials, wrong door: move them to the right tab and keep what they typed.
        const right = portalForRole(err.actualRole)
        setPortal(right)
        setNotice(`That is a ${PORTALS[right].who.toLowerCase()} account, so we moved you to the "${PORTALS[right].tab}" tab. Press the button again to continue.`)
        return
      }
      setError(err?.response?.data?.error || 'Could not sign in. Check your username and password.')
    }
  }

  return (
    <div className="lm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}>
      <div className={`lm-panel lm-${portal}`} role="dialog" aria-modal="true" aria-labelledby="lm-title">
        <div className="lm-aurora" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /></div>
        <button className="lm-close" onClick={onClose} disabled={loading} aria-label="Close"><X size={18} /></button>

        <div className="lm-brand">
          <span className="lm-mark">C2</span>
          <span className="lm-brand-txt"><b>Code2Hire</b><small>Powered by Acknowledger First</small></span>
        </div>

        <div className="lm-tabs" role="tablist" aria-label="Sign in as">
          <span className="lm-thumb" aria-hidden="true" />
          {ORDER.map((key) => {
            const p = PORTALS[key]; const TabIcon = p.icon; const on = key === portal
            return (
              <button key={key} type="button" role="tab" id={`lm-tab-${key}`} aria-selected={on} aria-controls="lm-form"
                tabIndex={on ? 0 : -1} className={`lm-tab ${on ? 'on' : ''}`} onClick={() => pick(key)} onKeyDown={onTabKey}>
                <TabIcon size={17} />
                <span><b>{p.tab}</b><small>{p.who} sign-in</small></span>
              </button>
            )
          })}
        </div>

        <form id="lm-form" role="tabpanel" aria-labelledby={`lm-tab-${portal}`} className="lm-form" onSubmit={handleSubmit} key={portal}>
          <div className="lm-head">
            <h2 id="lm-title">{cfg.lead} <span className="grad">{cfg.grad}</span></h2>
            <p>{cfg.sub}</p>
            <div className="lm-steps" aria-hidden="true">
              {cfg.steps.map((s, i) => <span key={s}>{i + 1}. {s}</span>)}
            </div>
          </div>

          <label className="lm-field">
            <span>{cfg.userLabel}</span>
            <input ref={userRef} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={cfg.userHint}
              autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          </label>
          <label className="lm-field">
            <span>Password</span>
            <div className="lm-pw">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" autoComplete="current-password" required />
              <button type="button" className="lm-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} tabIndex={-1}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {notice && <div className="lm-msg info" role="status"><Sparkles size={16} /> <span>{notice}</span></div>}
          {error && <div className="lm-msg err" role="alert"><AlertCircle size={16} /> <span>{error}</span></div>}

          <button className="lm-submit" type="submit" disabled={loading}>
            {loading ? <><span className="lm-spin" /> Signing in...</> : <>{cfg.cta} <ArrowRight size={18} /></>}
          </button>
          <p className="lm-foot"><Lock size={13} /> {cfg.foot}</p>
          <small className="lm-version">Version 01.00.04</small>
        </form>
      </div>
    </div>
  )
}
