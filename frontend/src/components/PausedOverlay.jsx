import { PauseCircle } from 'lucide-react'
import '../styles/shared.css'

export default function PausedOverlay({ violationCount, reason }) {
  const isCandidateStop = reason === 'candidate_stop'
  return (
    <div className="paused-overlay">
      <div className="paused-card">
        <div className="paused-icon"><PauseCircle size={36} color="#E74C3C" /></div>
        <h2>Interview paused</h2>
        {isCandidateStop ? (
          <p>You asked to stop the interview, so it's been paused here.</p>
        ) : (
          <p>Some unusual activity was detected during your interview, so it's been paused for admin review.</p>
        )}
        <p>This is not a rejection — it's just a hold. An admin will review and either resume your interview
        from exactly where it left off, or restart it.</p>
        {!isCandidateStop && violationCount > 0 && <p style={{ marginTop: 14, fontSize: 13, color: '#C9B6F5' }}>Violations logged this session: {violationCount}</p>}
        <div className="paused-pulse"><span className="paused-dot" /> Waiting for an admin…</div>
      </div>
    </div>
  )
}
