import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import '../styles/shared.css'

export default function InterviewDisclaimer({ onAccept, isResumeReminder = false }) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="disclaimer-overlay">
      <div className="disclaimer-card">
        <div className="disclaimer-icon"><ShieldAlert size={28} color="#A63A31" /></div>
        <h2>{isResumeReminder ? 'Before you continue' : 'Before you begin — please read'}</h2>
        <div className="disclaimer-body">
          {isResumeReminder ? (
            <>This interview was paused earlier. The same rules still apply for the rest of the session:</>
          ) : (
            <>This interview is monitored for integrity. <strong>If you switch tabs, minimize this window,
            exit fullscreen, open developer tools, or paste text into an answer, the interview will pause
            immediately.</strong></>
          )}
        </div>
        <div className="disclaimer-rules">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Only an <strong>admin</strong> can resume a paused interview — it will not resume on its own.</li>
            <li>Repeated violations will be visible to your admin on your final report.</li>
            <li>Stay in this single browser tab, in fullscreen, for the entire interview.</li>
            <li>Answer in your own words — pasted text is flagged.</li>
          </ul>
        </div>
        {!isResumeReminder && (
          <div className="disclaimer-howto">
            <div className="disclaimer-howto-title">How to answer</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>We&rsquo;ll ask for <strong>camera and microphone access</strong> next — both are required to begin. Your camera stays on and is recorded for the whole interview; you can still type your answers instead of speaking.</li>
              <li>Your video is monitored for <strong>presence</strong> — stepping out of frame or a second person appearing are both flagged, the same as switching tabs.</li>
              <li>After each question is read aloud, we&rsquo;ll <strong>start listening automatically</strong> — just start speaking.</li>
              <li>Press <strong>Enter</strong> or tap <strong>Send</strong> to submit an answer.</li>
              <li>Don&rsquo;t know an answer? Just say <strong>&ldquo;I don&rsquo;t know&rdquo;</strong> or <strong>&ldquo;skip&rdquo;</strong> and we&rsquo;ll move to the next question.</li>
            </ul>
          </div>
        )}
        <label className="disclaimer-checkbox">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I understand, and I'm ready to {isResumeReminder ? 'continue' : 'begin'} the interview under these conditions.</span>
        </label>
        <button className="btn btn-violet" style={{ width: '100%', justifyContent: 'center', padding: '13px' }} disabled={!checked} onClick={onAccept}>
          {isResumeReminder ? 'Continue interview' : 'Begin interview'}
        </button>
      </div>
    </div>
  )
}
