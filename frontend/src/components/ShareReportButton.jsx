import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import client from '../api/client'
import '../styles/shared.css'

/**
 * The admin's switch for whether the candidate can see a report. Reports are hidden from
 * the candidate by default; this is the only way to release one (and to take it back).
 */
export default function ShareReportButton({ sessionId, shared, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await client.post(`/admin/interview-sessions/${sessionId}/report/share`, { shared: !shared })
      onChanged?.(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not update sharing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className={`badge ${shared ? 'badge-completed' : 'badge-neutral'}`}>{shared ? 'Shared with candidate' : 'Not shared'}</span>
        <button className={`btn btn-sm ${shared ? 'btn-outline' : 'btn-violet'}`} onClick={toggle} disabled={busy}>
          {busy ? <span className={shared ? 'spinner dark' : 'spinner'} /> : shared ? <EyeOff size={14} /> : <Eye size={14} />}
          {shared ? 'Hide from candidate' : 'Share with candidate'}
        </button>
      </div>
      {error && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}
