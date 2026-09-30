import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react'
import client from '../../api/client'
import { getSocket } from '../../api/socket'
import InterviewDisclaimer from '../../components/InterviewDisclaimer'
import PausedOverlay from '../../components/PausedOverlay'
import { useIntegrityMonitor, enterFullscreen } from '../../components/useIntegrityMonitor'
import '../../styles/shared.css'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const STATUS_POLL_MS = 4000

export default function LiveInterview() {
  const { token } = useParams()
  const [phase, setPhase] = useState('loading')
  const [session, setSession] = useState(null)
  const [interviewerName, setInterviewerName] = useState('')
  const [error, setError] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [peerConnected, setPeerConnected] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const recorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const roomRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    setPhase('disclaimer')
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  const cleanup = () => {
    stopPolling()
    pcRef.current?.close()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    const socket = getSocket()
    if (roomRef.current) socket.emit('leave_room', { room: roomRef.current })
  }

  const setupPeerConnection = (room, socket) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc
    localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current))

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
      setPeerConnected(true)
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { room, payload: { type: 'ice-candidate', candidate: e.candidate } })
    }

    socket.on('peer_joined', async () => {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('signal', { room, payload: { type: 'offer', sdp: offer } })
    })

    socket.on('signal', async (payload) => {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        socket.emit('signal', { room, payload: { type: 'answer', sdp: ans } })
      } else if (payload.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      } else if (payload.type === 'ice-candidate') {
        try { await pc.addIceCandidate(payload.candidate) } catch (e) { /* ignore */ }
      }
    })

    socket.emit('join_room', { room, role: 'candidate' })
  }

  const startRecording = (sessionId) => {
    try {
      const combined = new MediaStream([...localStreamRef.current.getTracks()])
      const recorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp8,opus' })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const fd = new FormData()
        fd.append('file', blob, 'recording.webm')
        try { await client.post(`/candidate/interview/live/${sessionId}/upload-recording`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
        catch (e) { /* best effort */ }
      }
      recorder.start()
      recorderRef.current = recorder
    } catch (e) { /* recording is best-effort */ }
  }

  const beginCall = async () => {
    await enterFullscreen()
    setError('')
    try {
      const { data } = await client.post('/candidate/interview/live/join', { token })
      setSession(data.session)
      setInterviewerName(data.interviewer_name || 'your interviewer')
      roomRef.current = data.room

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream

      const socket = getSocket()
      setupPeerConnection(data.room, socket)
      startRecording(data.session.id)

      setPhase('active')
    } catch (err) {
      if (err?.response?.status === 423) {
        setSession(err.response.data.session)
        setPhase('paused')
      } else if (err.name === 'NotAllowedError') {
        setError('Camera/microphone access is required for a live interview. Please allow access and try again.')
        setPhase('error')
      } else {
        setError(err?.response?.data?.error || 'Could not join the interview.')
        setPhase('error')
      }
    }
  }

  const reportViolation = async (eventType) => {
    if (!session) return
    try {
      const { data } = await client.post(`/candidate/interview/${session.id}/violation`, { event_type: eventType })
      setSession((s) => ({ ...s, status: data.status }))
      getSocket().emit('integrity_ping', { room: roomRef.current, payload: { event_type: eventType } })
      setPhase('paused')
    } catch (e) {
      setPhase('paused')
    }
  }

  // Window-focus loss is only a notice to the admin: the live call keeps running.
  const reportNotice = async (eventType) => {
    if (!session) return
    try { await client.post(`/candidate/interview/${session.id}/violation`, { event_type: eventType }) }
    catch (e) { /* a missed notice must never disturb the call */ }
  }

  useIntegrityMonitor({ active: phase === 'active', requireFullscreen: true, watchCopyPaste: false, onViolation: reportViolation, onNotice: reportNotice })

  useEffect(() => {
    if (phase !== 'paused' || !session) return undefined
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/candidate/interview/${session.id}/status`)
        if (data.status === 'in_progress') { stopPolling(); setPhase('active') }
      } catch (e) { /* keep polling */ }
    }, STATUS_POLL_MS)
    return stopPolling
  }, [phase, session?.id])

  const endCall = async () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    cleanup()
    if (session) {
      try { await client.post(`/candidate/interview/live/${session.id}/finish`) } catch (e) { /* ignore */ }
    }
    setPhase('completed')
  }

  const toggleMic = () => { localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled }); setMicOn((m) => !m) }
  const toggleCam = () => { localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled }); setCamOn((c) => !c) }

  if (phase === 'loading') return <div className="card" style={{ textAlign: 'center', padding: 60, margin: 40 }}><span className="spinner dark" /></div>
  if (phase === 'error') return <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}><div className="banner banner-error">{error}</div></div>
  if (phase === 'disclaimer') return <InterviewDisclaimer onAccept={beginCall} />
  if (phase === 'paused') return <PausedOverlay violationCount={session?.violation_count || 0} />
  if (phase === 'completed') {
    return (
      <div className="live-call-shell" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 480, padding: 44 }}>
          <h2 style={{ marginBottom: 10 }}>Interview call ended</h2>
          <p style={{ fontSize: 14 }}>Thanks for your time. Your recording has been uploaded and your admin will finalize the report.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="live-call-shell">
      <div className="interview-topbar">
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Live Interview</div>
          <div className="role-label">with {interviewerName} {peerConnected ? '· connected' : '· waiting to connect…'}</div>
        </div>
        <div className="interview-progress-pill">🔴 Recording — monitored session</div>
      </div>

      <div className="live-video-grid">
        <div className="live-video-tile">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <span className="live-video-label">{interviewerName}</span>
          {!peerConnected && <span style={{ position: 'absolute', color: '#9C93B8', fontSize: 13 }}>Waiting for interviewer to join…</span>}
        </div>
        <div className="live-video-tile">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <span className="live-video-label">You</span>
        </div>
      </div>

      <div className="live-controls">
        <button className="live-control-btn" onClick={toggleMic}>{micOn ? <Mic size={20} /> : <MicOff size={20} />}</button>
        <button className="live-control-btn" onClick={toggleCam}>{camOn ? <Video size={20} /> : <VideoOff size={20} />}</button>
        <button className="live-control-btn end-call" onClick={endCall}><PhoneOff size={20} /></button>
      </div>
    </div>
  )
}
