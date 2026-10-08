import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown, Video, ShieldCheck, Sparkles, FileText, Mic, Lock, Check, ArrowRight,
  UserPlus, ListChecks, PlayCircle, ClipboardCheck, Send, Eye, Target, Menu, X,
} from 'lucide-react'
import LoginModal from '../components/LoginModal'
import './LandingPage.css'

/* ------------------------------------------------------------------ content */

const SCRIPT = [
  {
    role: 'Backend Engineer',
    q: 'Your resume mentions a slow reporting endpoint. How did you find the bottleneck?',
    a: 'I profiled the query, saw a full table scan, and added a composite index on the filter columns.',
    tags: ['Depth', 'Clear communication', 'Resume-matched'],
    score: 4.2,
  },
  {
    role: 'Data Analyst',
    q: 'Walk me through how you would validate a dashboard number that looks too good to be true.',
    a: 'I would reconcile it with the source tables, check the joins for duplicates, then compare against last period.',
    tags: ['Structured thinking', 'Data hygiene', 'Confident'],
    score: 3.9,
  },
  {
    role: 'Sales Executive',
    q: 'A prospect says your price is too high. What do you do in the next two minutes?',
    a: 'I would ask what they are comparing us to, then reframe around the cost of the problem we solve.',
    tags: ['Empathy', 'Objection handling', 'Persuasive'],
    score: 4.4,
  },
]

const JOURNEY = {
  candidate: [
    { icon: UserPlus, color: 'violet', title: 'Get your invite', body: 'Your recruiter adds you to a role. You sign in with the username and password they share.' },
    { icon: FileText, color: 'pink', title: 'Add your resume', body: 'Upload it once. Every question is matched to your own experience and the job description.' },
    { icon: Sparkles, color: 'amber', title: 'Practice freely', body: 'Rehearse as many times as you like with voice or text, and see what to improve before it counts.' },
    { icon: Video, color: 'cyan', title: 'Take the interview', body: 'A fair, clearly monitored session. You are told the rules before the camera ever turns on.' },
    { icon: Target, color: 'green', title: 'See your results', body: 'When your interviewer shares it, view your score, strengths and answers question by question.' },
  ],
  recruiter: [
    { icon: ListChecks, color: 'violet', title: 'Create the role', body: 'Paste the job description. Skills are picked out so people and roles are easy to search.' },
    { icon: UserPlus, color: 'pink', title: 'Add candidates', body: 'A three step wizard sets the resume, the practice or real interview mode and the invite.' },
    { icon: ClipboardCheck, color: 'amber', title: 'Approve the questions', body: 'AI drafts a set from the JD and resume. Nothing airs until a human approves it.', gate: 'Gate 1' },
    { icon: PlayCircle, color: 'cyan', title: 'Interview, live or AI', body: 'Watch live, with camera checks and a recording. Violations are flagged, not hidden.' },
    { icon: Eye, color: 'orange', title: 'Review the report', body: 'Record a verdict: Proceed, Hold, Reject or Re-interview. This step cannot be skipped.', gate: 'Gate 2' },
    { icon: Send, color: 'green', title: 'Share when ready', body: 'Candidates only see a report after you have reviewed it and chosen to share it.', gate: 'Gate 3' },
  ],
}

const FEATURES = {
  candidate: [
    { icon: Sparkles, color: 'violet', title: 'Practice against your real resume', body: 'Rehearse with a simulation built from your own resume and the actual job description, so nothing in the real interview catches you off guard.' },
    { icon: Mic, color: 'pink', title: 'Speak naturally, or type', body: "Auto-listen starts right after each question. Prefer typing, or want to say 'I don't know' and move on? Both work." },
    { icon: ShieldCheck, color: 'cyan', title: 'Know the rules upfront', body: "Before you begin you are told exactly what is monitored and why: camera, tab focus, fullscreen. No surprise pauses." },
    { icon: FileText, color: 'amber', title: 'See your own results', body: 'Once your interviewer shares it, view your score, strengths and how you answered, question by question, in your dashboard.' },
  ],
  recruiter: [
    { icon: ClipboardCheck, color: 'violet', title: 'Approve before it airs', body: 'Draft every question ahead of time and approve it yourself. The real interview serves your approved set with no live-AI wait.' },
    { icon: Sparkles, color: 'pink', title: 'Follow-ups that actually listen', body: 'The AI reads what the candidate said and asks a follow-up grounded in their answer, with the approved question always ready as a fallback.' },
    { icon: Video, color: 'cyan', title: 'Camera-verified, not self-reported', body: 'Presence monitoring flags if a candidate leaves the frame or someone else joins. The session is recorded and watchable live or later.' },
    { icon: Lock, color: 'amber', title: 'You decide what candidates see', body: 'Every report stays private until you review it and choose to share. You control how many attempts a candidate gets.' },
  ],
}

const ROLES = [
  { name: 'Backend Engineer', skills: ['Python', 'Flask', 'SQL', 'APIs'], q: 'How would you design rate limiting for a public API?' },
  { name: 'Frontend Developer', skills: ['React', 'CSS', 'Performance'], q: 'A page feels slow on mobile. Where do you start looking?' },
  { name: 'Data Analyst', skills: ['SQL', 'Excel', 'Dashboards'], q: 'How do you decide which metric deserves a dashboard tile?' },
  { name: 'Sales Executive', skills: ['Prospecting', 'Negotiation', 'CRM'], q: 'Describe your last lost deal and what you would change.' },
  { name: 'HR Associate', skills: ['Screening', 'Onboarding', 'Policy'], q: 'How do you handle two strong candidates for one role?' },
  { name: 'Customer Support', skills: ['Empathy', 'Escalation', 'Tools'], q: 'A customer is angry and partly right. What do you say first?' },
  { name: 'Product Manager', skills: ['Roadmaps', 'Prioritising', 'Research'], q: 'How do you say no to a feature your CEO loves?' },
  { name: 'DevOps Engineer', skills: ['CI/CD', 'Linux', 'Monitoring'], q: 'Production is down at 2 a.m. Walk me through your first ten minutes.' },
]

const TRUST = [
  { icon: Target, color: 'violet', title: 'Resume aware', body: 'Questions come from the JD and each candidate’s own resume.' },
  { icon: Video, color: 'cyan', title: 'Monitored fairly', body: 'Camera, focus and fullscreen checks, disclosed before you start.' },
  { icon: Eye, color: 'amber', title: 'Human review gate', body: 'No report is shared until an admin records a verdict.' },
  { icon: Lock, color: 'green', title: 'Private by default', body: 'Candidates see only what the interviewer chooses to share.' },
]

const FAQS = [
  { q: 'Is my interview actually being watched, or just recorded?', a: 'Both, when camera monitoring is on: your hiring team can watch live from your session page, and the full interview is recorded for review afterward. You are told this upfront, before your camera ever turns on.' },
  { q: 'What if I glance away or switch windows for a second?', a: 'Momentary things like losing window focus are logged as a notice for your interviewer, not a violation, and the interview keeps running. Switching tabs, exiting fullscreen, or a second face appearing on camera does pause it, pending review.' },
  { q: 'Can I retake an interview if something goes wrong?', a: "By default you get one attempt. If you are cut off by a technical issue, your hiring team can grant you another attempt. That is their call, not something you can trigger yourself." },
  { q: 'Will I ever see my evaluation?', a: 'Only once your interviewer has reviewed it and chosen to share it. You will see your score, strengths and your own answers next to a reference answer, but not their internal hiring recommendation.' },
  { q: 'Do we have to write the interview questions ourselves?', a: 'No. Questions are generated from the job description and each candidate’s resume. You review and approve the set before anyone can take the interview.' },
  { q: 'What happens if the AI service is briefly down mid-interview?', a: 'The candidate never sees a stall: if a live follow-up call fails or times out, the system falls back to the pre-approved question for that topic.' },
]

/* -------------------------------------------------------------------- hooks */

function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const nodes = root.querySelectorAll('.rv')
    if (typeof IntersectionObserver === 'undefined') { nodes.forEach((n) => n.classList.add('in')); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' })
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  })
  return ref
}

function useCountUp(target, active, ms = 1400) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, ms])
  return v
}

/* ------------------------------------------------------------- illustrations */

function Face({ skin = '#F2C39B', hair = '#2B1B54', shirt = '#7C5CFF', bg1 = '#C9B8FF', bg2 = '#7C5CFF', long = false }) {
  const id = `g${skin.slice(1)}${hair.slice(1)}${shirt.slice(1)}`
  return (
    <svg viewBox="0 0 200 200" className="lp-face" role="img" aria-label="Candidate">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bg1} /><stop offset="1" stopColor={bg2} /></linearGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#${id})`} />
      <circle cx="40" cy="40" r="46" fill="#fff" opacity=".12" />
      <circle cx="170" cy="150" r="60" fill="#fff" opacity=".1" />
      <path d="M30 200c4-42 34-62 70-62s66 20 70 62z" fill={shirt} />
      <path d="M84 132h32v22c-7 7-25 7-32 0z" fill={skin} />
      {long && <path d="M52 92c0-38 22-54 48-54s48 16 48 54c0 30 4 52-8 66H60c-12-14-8-36-8-66z" fill={hair} />}
      <ellipse cx="100" cy="96" rx="36" ry="42" fill={skin} />
      <path d={long ? 'M62 92c-2-34 18-50 40-50 26 0 40 18 36 50-10-14-22-22-38-22-14 0-28 8-38 22z' : 'M62 88c-4-36 18-52 40-52 26 0 42 18 36 54-6-14-12-24-22-28-18 6-38 4-54 26z'} fill={hair} />
      <circle cx="86" cy="98" r="3.4" fill="#2B1B54" />
      <circle cx="114" cy="98" r="3.4" fill="#2B1B54" />
      <path d="M88 116c8 8 16 8 24 0" fill="none" stroke="#B5524B" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="78" cy="110" r="5" fill="#FF8FA3" opacity=".35" />
      <circle cx="122" cy="110" r="5" fill="#FF8FA3" opacity=".35" />
    </svg>
  )
}

function Waveform({ active }) {
  return (
    <div className={`lp-wave ${active ? 'on' : ''}`} aria-hidden="true">
      {Array.from({ length: 22 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 7) * 0.09}s`, '--h': `${30 + ((i * 37) % 70)}%` }} />)}
    </div>
  )
}

function InterviewMock() {
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState(0) // 0 asking, 1 answering, 2 scored
  const [n, setN] = useState(0)
  const cur = SCRIPT[i]
  // Only animate while the mock is actually on screen, so it never does work (or moves anything)
  // while the visitor is reading another section.
  const mockRef = useRef(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = mockRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(2); setN(9999); return
    }
    if (!visible) return undefined
    let t
    if (phase === 0) {
      t = setInterval(() => setN((x) => { if (x >= cur.q.length) { clearInterval(t); setTimeout(() => { setN(0); setPhase(1) }, 650); return x } return x + 2 }), 28)
    } else if (phase === 1) {
      t = setInterval(() => setN((x) => { if (x >= cur.a.length) { clearInterval(t); setTimeout(() => setPhase(2), 500); return x } return x + 2 }), 26)
    } else {
      t = setTimeout(() => { setN(0); setPhase(0); setI((x) => (x + 1) % SCRIPT.length) }, 3200)
    }
    return () => { clearInterval(t); clearTimeout(t) }
  }, [phase, i, cur, visible])

  const q = phase === 0 ? cur.q.slice(0, n) : cur.q
  const a = phase === 1 ? cur.a.slice(0, n) : phase === 2 ? cur.a : ''
  const faces = [
    <Face key="a" />,
    <Face key="b" skin="#8D5A3B" hair="#1B1230" shirt="#FF5C8A" bg1="#FFD1E0" bg2="#FF5C8A" long />,
    <Face key="c" skin="#E8B48A" hair="#5A3A1E" shirt="#19B5C9" bg1="#BDEFF6" bg2="#19B5C9" />,
  ]

  return (
    <div className="lp-mock" ref={mockRef}>
      <div className="lp-mock-bar">
        <span className="lp-dots"><i /><i /><i /></span>
        <span className="lp-mock-title">Live interview · {cur.role}</span>
        <span className="lp-rec"><b /> REC</span>
      </div>
      <div className="lp-mock-body">
        <div className="lp-cam">
          <div className="lp-cam-face" key={i}>{faces[i % faces.length]}</div>
          <span className="lp-corner tl" /><span className="lp-corner tr" /><span className="lp-corner bl" /><span className="lp-corner br" />
          <span className="lp-scan" />
          <span className="lp-chip lp-chip-ok"><Check size={12} /> Face detected</span>
          <span className="lp-chip lp-chip-focus">Focus OK</span>
          <Waveform active={phase === 1} />
        </div>
        <div className="lp-chat">
          {/* Invisible copies of every finished conversation share the same grid cell, so the panel is
              always as tall as the longest one and nothing below it moves while the demo types. */}
          {SCRIPT.map((sc, k) => (
            <div className="lp-chat-ghost" aria-hidden="true" key={k}>
              <div className="lp-bubble ai"><span className="lp-who">Interviewer</span>{sc.q}</div>
              <div className="lp-bubble you"><span className="lp-who">You</span>{sc.a}</div>
              <div className="lp-scorecard">
                <div className="lp-scoreline"><span>Answer score</span><b>{sc.score}<small>/5</small></b></div>
                <div className="lp-tags">{sc.tags.map((t) => <span key={t}>{t}</span>)}</div>
              </div>
            </div>
          ))}
          <div className="lp-chat-live">
            <div className="lp-bubble ai"><span className="lp-who">Interviewer</span>{q}{phase === 0 && <em className="lp-caret" />}</div>
            {(phase >= 1) && <div className="lp-bubble you"><span className="lp-who">You</span>{a}{phase === 1 && <em className="lp-caret" />}</div>}
            {phase === 2 && (
              <div className="lp-scorecard">
                <div className="lp-scoreline"><span>Answer score</span><b>{cur.score}<small>/5</small></b></div>
                <div className="lp-tags">{cur.tags.map((t, k) => <span key={t} style={{ animationDelay: `${k * 0.12}s` }}>{t}</span>)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="lp-float lp-float-a"><ShieldCheck size={15} /> Review required before sharing</div>
      <div className="lp-float lp-float-b"><Sparkles size={15} /> Matched to resume</div>
    </div>
  )
}

function ReportCard() {
  const ref = useRef(null)
  const [active, setActive] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setActive(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setActive(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const score = useCountUp(4.1, active)
  const C = 2 * Math.PI * 52
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -8, y: ((e.clientX - r.left) / r.width - 0.5) * 10 })
  }
  const bars = [['Technical depth', 86, 'violet'], ['Communication', 78, 'pink'], ['Problem solving', 91, 'cyan'], ['Role fit', 72, 'amber']]
  return (
    <div className="lp-report-wrap" onMouseMove={move} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
      <div className="lp-report" ref={ref} style={{ transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
        <div className="lp-report-head">
          <div className="lp-report-person">
            <div className="lp-avatar"><Face skin="#8D5A3B" hair="#1B1230" shirt="#FF5C8A" bg1="#FFD1E0" bg2="#FF5C8A" long /></div>
            <div><b>Priya Sharma</b><span>Backend Engineer · Attempt 1 of 1</span></div>
          </div>
          <span className="lp-pill ok"><Check size={13} /> Reviewed</span>
        </div>
        <div className="lp-report-grid">
          <div className="lp-ring">
            <svg viewBox="0 0 120 120">
              <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7C5CFF" /><stop offset=".5" stopColor="#FF5C8A" /><stop offset="1" stopColor="#FFB547" /></linearGradient></defs>
              <circle cx="60" cy="60" r="52" className="trk" />
              <circle cx="60" cy="60" r="52" className="val" style={{ strokeDasharray: C, strokeDashoffset: active ? C * (1 - 4.1 / 5) : C }} />
            </svg>
            <div className="lp-ring-n"><b>{score.toFixed(1)}</b><span>out of 5</span></div>
          </div>
          <div className="lp-bars">
            {bars.map(([label, v, c], k) => (
              <div className="lp-bar" key={label}>
                <div className="lp-bar-top"><span>{label}</span><b>{v}%</b></div>
                <div className="lp-bar-track"><i className={c} style={{ width: active ? `${v}%` : '0%', transitionDelay: `${0.2 + k * 0.15}s` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-verdicts">
          <span className="v proceed">Proceed</span><span className="v hold">Hold</span><span className="v reject">Reject</span><span className="v re">Re-interview</span>
        </div>
        <div className="lp-report-foot"><Lock size={14} /> Hidden from the candidate until you share it.</div>
      </div>
      <span className="lp-orb o1" /><span className="lp-orb o2" />
    </div>
  )
}

/* --------------------------------------------------------------------- page */

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [persona, setPersona] = useState('candidate')
  const [openFaq, setOpenFaq] = useState(0)
  const [role, setRole] = useState(0)
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const rootRef = useReveal()
  const isHiring = persona === 'recruiter'
  const steps = JOURNEY[persona]
  const login = () => { setMenu(false); setLoginOpen(true) }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const Toggle = ({ className = '' }) => (
    <div className={`lp-toggle ${className}`} role="tablist" aria-label="View this page as">
      <button role="tab" aria-selected={!isHiring} className={!isHiring ? 'active' : ''} onClick={() => setPersona('candidate')}>I&rsquo;m preparing</button>
      <button role="tab" aria-selected={isHiring} className={isHiring ? 'active' : ''} onClick={() => setPersona('recruiter')}>I&rsquo;m hiring</button>
    </div>
  )

  return (
    <div className="lp" ref={rootRef}>
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <a href="#top" className="lp-brand">
          <span className="lp-mark">C2</span>
          <span className="lp-brand-txt"><b>Code2Hire</b><small>Powered by Acknowledger First</small></span>
        </a>
        <nav className={`lp-links ${menu ? 'open' : ''}`}>
          <a href="#journey" onClick={() => setMenu(false)}>How it works</a>
          <a href="#report" onClick={() => setMenu(false)}>Sample report</a>
          <a href="#roles" onClick={() => setMenu(false)}>Roles</a>
          <a href="#integrity" onClick={() => setMenu(false)}>Integrity</a>
          <a href="#faq" onClick={() => setMenu(false)}>FAQ</a>
          <button className="lp-btn ghost lp-links-login" onClick={login}>Login</button>
        </nav>
        <button className="lp-btn ghost lp-nav-login" onClick={login}>Login</button>
        <button className="lp-burger" onClick={() => setMenu((m) => !m)} aria-label="Menu">{menu ? <X size={20} /> : <Menu size={20} />}</button>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-aurora" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /><i className="a4" /></div>
        <div className="lp-grid" aria-hidden="true" />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <Toggle />
            <span className="lp-eyebrow"><i /> {isHiring ? 'Interview, review and report in one flow' : 'Practice first, then interview with clear rules'}</span>
            <h1 key={persona} className="lp-h1">
              {isHiring ? <>Hire on proof,<br /><span className="grad">not on a hunch.</span></> : <>Practice it.<br /><span className="grad">Then prove it.</span></>}
            </h1>
            <p className="lp-lead">
              {isHiring
                ? 'Run resume-matched interviews, watch them live, and make every decision through a mandatory human review. Candidates see a report only when you share it.'
                : 'Rehearse against your own resume and the real job description, then take a fair, clearly monitored interview. See your results once your interviewer shares them.'}
            </p>
            <div className="lp-actions">
              <button className="lp-btn primary lg" onClick={login}>Login to your account <ArrowRight size={18} /></button>
              <a href="#journey" className="lp-btn ghost lg">See how it works</a>
            </div>
            <ul className="lp-checks">
              <li><Check size={14} /> Resume-aware questions</li>
              <li><Check size={14} /> Live monitoring</li>
              <li><Check size={14} /> Human review gate</li>
            </ul>
          </div>
          <InterviewMock />
        </div>
        <div className="lp-powered-hero">Powered by <b>Acknowledger First</b></div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-track">
          {[0, 1].map((k) => (
            <div className="lp-marquee-row" key={k}>
              {['Resume matched', 'Voice or text answers', 'Live proctoring', 'Question approval', 'Mandatory review', 'Private reports', 'Re-interview option', 'Role based search'].map((t) => <span key={t + k}><i />{t}</span>)}
            </div>
          ))}
        </div>
      </div>

      <section id="journey" className="lp-sec">
        <div className="lp-sec-head rv">
          <span className="lp-kicker pink">The journey</span>
          <h2>{isHiring ? 'From job description to a decision you can defend' : 'From invite to results, nothing is a surprise'}</h2>
          <Toggle className="lp-toggle-light" />
        </div>
        <ol className={`lp-path n${steps.length}`}>
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <li key={persona + s.title} className={`lp-step rv ${s.color}`} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="lp-step-n">{i + 1}</span>
                <span className="lp-step-ic"><Icon size={22} /></span>
                {s.gate && <span className="lp-gate"><Lock size={11} /> {s.gate}</span>}
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            )
          })}
        </ol>
      </section>

      <section id="report" className="lp-sec lp-sec-dark">
        <div className="lp-split">
          <div className="lp-split-copy rv">
            <span className="lp-kicker cyan">The report</span>
            <h2>Scores you can read at a glance. Decisions that are recorded.</h2>
            <p>Every interview ends in a scored report with strengths, gaps and the integrity log. A recruiter records a verdict before anything moves forward, so the outcome is always on file.</p>
            <ul className="lp-bullets">
              <li><Check size={16} /> Proceed, Hold, Reject or Re-interview, with a note</li>
              <li><Check size={16} /> A Reject never affects the candidate&rsquo;s login</li>
              <li><Check size={16} /> Compare candidates side by side inside a role</li>
              <li><Check size={16} /> Export the whole role as a spreadsheet</li>
            </ul>
          </div>
          <div className="rv"><ReportCard /></div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-sec-head rv">
          <span className="lp-kicker violet">{isHiring ? 'For hiring teams' : 'For candidates'}</span>
          <h2>{isHiring ? 'Everything a recruiter needs, nothing they do not' : 'Built so you walk in ready'}</h2>
        </div>
        <div className="lp-feat-grid">
          {FEATURES[persona].map(({ icon: Icon, color, title, body }, i) => (
            <article key={persona + title} className={`lp-feat rv ${color}`} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="lp-feat-ic"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="roles" className="lp-sec lp-sec-tint">
        <div className="lp-sec-head rv">
          <span className="lp-kicker amber">Every role</span>
          <h2>Not just for developers</h2>
          <p className="lp-sub">Pick a role to see the kind of question it starts with.</p>
        </div>
        <div className="lp-roles rv">
          <div className="lp-role-chips">
            {ROLES.map((r, i) => <button key={r.name} className={`lp-role-chip ${i === role ? 'active' : ''}`} onClick={() => setRole(i)}>{r.name}</button>)}
          </div>
          <div className="lp-role-card" key={role}>
            <div className="lp-role-q"><Sparkles size={18} /><p>&ldquo;{ROLES[role].q}&rdquo;</p></div>
            <div className="lp-role-skills">{ROLES[role].skills.map((s) => <span key={s}>{s}</span>)}</div>
            <small>Sample question. Real sets are generated from your job description and the candidate&rsquo;s resume.</small>
          </div>
        </div>
      </section>

      <section id="integrity" className="lp-sec">
        <div className="lp-sec-head rv">
          <span className="lp-kicker green">Integrity</span>
          <h2>Fair for candidates. Trustworthy for teams.</h2>
        </div>
        <div className="lp-trust-grid">
          {TRUST.map(({ icon: Icon, color, title, body }, i) => (
            <div key={title} className={`lp-trust rv ${color}`} style={{ transitionDelay: `${i * 80}ms` }}>
              <span><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className="lp-two rv">
          <div>
            <h3>For hiring teams</h3>
            <p>Sessions are watched for real violations such as tab switches, fullscreen exits and a second face on camera. A flagged interview never quietly slips through. Momentary things like a lost window focus are logged as a notice, so the signal stays meaningful.</p>
          </div>
          <div>
            <h3>For candidates</h3>
            <p>You are told exactly what is monitored before your camera turns on. If something pauses your interview it is not a rejection. It is a hold for your interviewer to review, and they can resume you right where you left off.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="lp-sec lp-sec-narrow">
        <div className="lp-sec-head rv">
          <span className="lp-kicker pink">FAQ</span>
          <h2>Questions people actually ask</h2>
        </div>
        <div className="lp-faq">
          {FAQS.map((item, i) => (
            <div className={`lp-faq-item rv ${openFaq === i ? 'open' : ''}`} key={item.q}>
              <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                {item.q}<ChevronDown size={18} />
              </button>
              <div className="lp-faq-a"><p>{item.a}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-cta rv">
        <div className="lp-aurora small" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /></div>
        <div className="lp-cta-inner">
          <h2>Ready for your next hiring round?</h2>
          <p>Sign in to set up a role, add candidates and run a full practice-to-report cycle with your team.</p>
          <div className="lp-actions center">
            <button className="lp-btn primary lg" onClick={login}>Login to your account <ArrowRight size={18} /></button>
          </div>
          <div className="lp-powered-badge"><span className="lp-powered-dot" /> Powered by <b>Acknowledger First</b></div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <span className="lp-mark">C2</span>
          <div><b>Code2Hire</b><small>Powered by Acknowledger First</small></div>
        </div>
        <div className="lp-footer-links">
          <a href="#journey">How it works</a>
          <a href="#report">Sample report</a>
          <a href="#roles">Roles</a>
          <a href="#faq">FAQ</a>
        </div>
        <span className="lp-copy">&copy; {new Date().getFullYear()} Code2Hire. All rights reserved.</span>
      </footer>

      {loginOpen && <LoginModal initialRole={isHiring ? 'admin' : 'candidate'} onClose={() => setLoginOpen(false)} />}
    </div>
  )
}
