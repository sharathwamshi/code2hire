import { useEffect, useRef, useState } from 'react'
import { Video, Download, X } from 'lucide-react'
import client from '../api/client'
import '../styles/shared.css'

/**
 * Fetches the interview recording as an authenticated blob (a plain <a href> to this
 * admin-only route would 401 - it can't carry the JWT this app uses) and plays it in an
 * in-browser <video> player, with a Download action using the same already-fetched blob.
 */
export default function RecordingButton({ sessionId, label = 'Watch recording' }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const urlRef = useRef(null)

  useEffect(() => () => { if (urlRef.current) window.URL.revokeObjectURL(urlRef.current) }, [])

  const openPlayer = async () => {
    setOpen(true)
    if (videoUrl || loading) return
    setLoading(true); setError('')
    try {
      const res = await client.get(`/admin/interview-sessions/${sessionId}/recording`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data)
      urlRef.current = url
      setVideoUrl(url)
    } catch (err) {
      setError(err?.response?.status === 404 ? 'No recording is available for this session.' : 'Could not load the recording.')
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!urlRef.current) return
    const a = document.createElement('a')
    a.href = urlRef.current
    a.download = `interview-recording-${sessionId}.webm`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <>
      <button className="btn btn-outline btn-sm" onClick={openPlayer}><Video size={14} /> {label}</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Interview recording</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {loading && <p style={{ fontSize: 13 }}>Loading recording…</p>}
            {error && <div className="banner banner-error">{error}</div>}
            {videoUrl && (
              <>
                <video controls src={videoUrl} style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: '65vh' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button className="btn btn-violet btn-sm" onClick={download}><Download size={14} /> Download</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
