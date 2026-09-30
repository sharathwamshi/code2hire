import { useState } from 'react'
import { ChevronDown, Video, ShieldCheck, Sparkles, FileText, Mic, Lock } from 'lucide-react'
import NodeGraphBackdrop from '../components/NodeGraphBackdrop'
import LoginModal from '../components/LoginModal'
import './LandingPage.css'

const EMPLOYER_FEATURES = [
  { icon: FileText, title: 'Approve before it airs', body: 'Draft every question ahead of time and approve it yourself — the real interview serves your approved set instantly, with no live-AI wait mid-session.' },
  { icon: Sparkles, title: 'Follow-ups that actually listen', body: 'The AI reviews what the candidate specifically said and asks a follow-up grounded in their answer, not a generic script — with the original approved question always ready as a fallback.' },
  { icon: Video, title: 'Camera-verified, not self-reported', body: "Live presence monitoring flags if a candidate steps out of frame or someone else joins, and the full session is recorded — watchable live or afterward, right from the candidate's page." },
  { icon: Lock, title: 'You decide what candidates see', body: "Every report stays private until you choose to share it, and you control exactly how many attempts a candidate gets — they can't retake it on their own." },
]

const CANDIDATE_FEATURES = [
  { icon: Sparkles, title: 'Practice against your real resume', body: 'Rehearse with a simulation built from your own resume and the actual job description, so nothing in the real interview catches you off guard.' },
  { icon: Mic, title: 'Speak naturally, or type', body: "Auto-listen starts right after each question — just start talking. Prefer typing, or answer 'I don't know' to move on? Both work." },
  { icon: ShieldCheck, title: 'Know the rules upfront', body: "Before you begin, you're told exactly what's monitored and why — camera, tab focus, fullscreen — no surprise pauses." },
  { icon: FileText, title: 'See your own results', body: 'Once your interviewer shares it, view your own score, strengths, and how you answered — question by question, in your dashboard.' },
]

const FAQS = [
  { q: 'Is my interview actually being watched, or just recorded?', a: 'Both, when camera monitoring is on: your hiring team can watch live from your session page, and the full interview is recorded for review afterward. You\u2019re told this upfront, before your camera ever turns on.' },
  { q: 'What if I glance away or switch windows for a second?', a: "Momentary things like losing window focus are logged as a notice for your interviewer, not a violation \u2014 the interview keeps running. Switching tabs, exiting fullscreen, or a second face appearing on camera does pause it, pending review." },
  { q: 'Can I retake an interview if something goes wrong?', a: "By default you get one attempt. If you're cut off by a technical issue, your hiring team can grant you another attempt \u2014 that's their call, not something you can trigger yourself." },
  { q: 'Will I ever see my evaluation?', a: "Only once your interviewer chooses to share it. When they do, you'll see your score, strengths, and your own answers side-by-side with a reference answer \u2014 but not their internal hiring recommendation." },
  { q: "Do we have to write the interview questions ourselves?", a: 'No \u2014 questions are generated from the job description and each candidate\u2019s resume automatically. You review and approve the set before anyone can take the interview.' },
  { q: 'What happens if the AI service is briefly down mid-interview?', a: 'The candidate never sees a stall: if a live follow-up call fails or times out, the system automatically falls back to the pre-approved question for that topic.' },
]

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [persona, setPersona] = useState('candidate') // 'employer' | 'candidate' — candidates are the more common visitor
  const [openFaq, setOpenFaq] = useState(0)
  const isEmployer = persona === 'employer'

  const PersonaToggle = ({ className }) => (
    <div className={`persona-toggle ${className || ''}`} role="tablist" aria-label="View this page as">
      <button role="tab" aria-selected={isEmployer} className={isEmployer ? 'active' : ''} onClick={() => setPersona('employer')}>I&rsquo;m hiring</button>
      <button role="tab" aria-selected={!isEmployer} className={!isEmployer ? 'active' : ''} onClick={() => setPersona('candidate')}>I&rsquo;m interviewing</button>
    </div>
  )

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-brand-mark">C2</span>
          <span className="landing-brand-name">Code2Hire</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#portals">Portals</a>
          <a href="#how-it-works">How it works</a>
          <a href="#integrity">Integrity</a>
          <a href="#faq">FAQ</a>
        </nav>
        <button className="landing-login-btn" onClick={() => setLoginOpen(true)}>Login</button>
      </header>

      <section className="landing-hero">
        <NodeGraphBackdrop nodeCount={40} />
        <div className="landing-hero-inner">
          <div className="landing-hero-content">
            <PersonaToggle />
            {isEmployer ? (
              <>
                <span className="landing-eyebrow">Prep, interview and report — one platform</span>
                <h1>Hire on what candidates can actually do</h1>
                <p>Code2Hire runs candidates through a resume-matched practice round, then a monitored interview — AI-conducted or live video — and hands your team a scored report before the call ends.</p>
              </>
            ) : (
              <>
                <span className="landing-eyebrow">Practice first, then interview with clear rules</span>
                <h1>Walk in already knowing what to expect</h1>
                <p>Code2Hire preps you against your own resume and the real job description first, then gives you a fair, clearly-monitored interview — and lets you see your own results once your interviewer shares them.</p>
              </>
            )}
            <div className="landing-hero-actions">
              <button className="landing-cta" onClick={() => setLoginOpen(true)}>Login to your account</button>
              <a href="#portals" className="landing-secondary-link">See how it works</a>
            </div>
          </div>

          {isEmployer ? (
            <div className="hero-mock employer-mock">
              <div className="mock-topbar"><span className="mock-dot" /> Interview report</div>
              <div className="mock-report-header">
                <div>
                  <div className="mock-candidate-name">Priya Sharma</div>
                  <div className="mock-candidate-role">Backend Engineer</div>
                </div>
                <div className="mock-score">3.8<span>/5</span></div>
              </div>
              <div className="mock-badges">
                <span className="mock-badge good">Selected</span>
                <span className="mock-badge neutral">Clean session</span>
              </div>
              <div className="mock-strengths-label">Key strengths</div>
              <div>
                <span className="mock-strength-tag">Query optimization</span>
                <span className="mock-strength-tag">Clear communication</span>
                <span className="mock-strength-tag">System design</span>
              </div>
            </div>
          ) : (
            <div className="hero-mock candidate-mock">
              <div className="mock-topbar"><span className="mock-dot" /> Live interview session</div>
              <div className="mock-bubble ai">
                <span className="mock-label">Interviewer</span>
                Tell me about a time you optimized a slow database query.
              </div>
              <div className="mock-bubble candidate">
                <span className="mock-label">You</span>
                One endpoint was doing a full table scan, so I added a composite index on the columns it filtered on.
              </div>
              <div className="mock-footer"><span className="mock-live-dot" /> Camera on · Auto-listening</div>
            </div>
          )}
        </div>
      </section>

      <section id="portals" className="landing-section">
        <h2>Two portals, one platform</h2>
        <p className="landing-section-sub">Everything below adapts to whichever you are — switch anytime.</p>
        <PersonaToggle className="portals-toggle" />
        <div className="landing-feature-grid">
          {(isEmployer ? EMPLOYER_FEATURES : CANDIDATE_FEATURES).map(({ icon: Icon, title, body }) => (
            <div className="landing-feature-card" key={title}>
              <Icon size={20} color="var(--violet-600)" style={{ marginBottom: 12 }} />
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2>From job description to decision</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <span className="landing-step-label">Step 1</span>
            <h3>Set up the role</h3>
            <p>Add the job description and candidates. Code2Hire builds the prep simulation and interview questions from it.</p>
          </div>
          <div className="landing-step">
            <span className="landing-step-label">Step 2</span>
            <h3>Candidate prepares and interviews</h3>
            <p>They practice against their own resume, then sit the monitored interview — AI-conducted or live.</p>
          </div>
          <div className="landing-step">
            <span className="landing-step-label">Step 3</span>
            <h3>Review the report</h3>
            <p>Your team gets a scored evaluation and the integrity log, ready to compare across candidates.</p>
          </div>
        </div>
      </section>

      <section id="integrity" className="landing-section landing-section-tinted">
        <h2>Integrity that works both ways</h2>
        <div className="landing-integrity-grid">
          <div>
            <h3>For hiring teams</h3>
            <p>Sessions are watched for real violations — tab switches, fullscreen exits, a second face on camera — with an admin-only lock so a flagged interview never quietly slips through. Momentary things like a lost window focus are logged as a notice, not a violation, so the signal stays meaningful.</p>
          </div>
          <div>
            <h3>For candidates</h3>
            <p>You're told exactly what's monitored before your camera turns on. If something pauses your interview, it's not a rejection — it's a hold for your interviewer to review, and they can resume you right where you left off.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="landing-section">
        <h2>Questions people actually ask</h2>
        <div className="faq-list">
          {FAQS.map((item, i) => (
            <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={item.q}>
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                {item.q}
                <ChevronDown size={18} />
              </button>
              <div className="faq-answer">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta-band">
        <div>
          <h2>Bring Code2Hire to your next hiring round</h2>
          <p>Sign in to set up a job description and try a full prep-to-report cycle with your team.</p>
        </div>
        <button className="landing-cta" onClick={() => setLoginOpen(true)}>Login to your account</button>
      </section>

      <footer className="landing-footer">
        <span>Code2Hire — Powered by Acknowledger First.</span>
        <div className="landing-footer-links">
          <a href="#portals">Portals</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
      </footer>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  )
}
