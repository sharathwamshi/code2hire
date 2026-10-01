import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Send, Volume2, VolumeX, CheckCircle2, Info, X, LogOut, VideoOff, ShieldAlert } from 'lucide-react'
import client from '../../api/client'
import { getSocket } from '../../api/socket'
import { speak, startListening, stopSpeaking } from '../../api/speech'
import * as faceapi from 'face-api.js'
import InterviewDisclaimer from '../../components/InterviewDisclaimer'
import PausedOverlay from '../../components/PausedOverlay'
import { useIntegrityMonitor, enterFullscreen } from '../../components/useIntegrityMonitor'
import '../../styles/shared.css'

const STATUS_POLL_MS = 4000
const SILENCE_NUDGE_MS = 20000
const MAX_LISTEN_MS = 5 * 60 * 1000 // safety cap for one continuous recording
const GIVE_UP_CONFIRM_MS = 2500
const AUTO_LISTEN_DELAY_MS = 400 // short buffer so the mic doesn't catch the AI's own trailing audio
// A hardcoded fallback: STUN alone only helps when at least one side has an open NAT, and
// fails once both sides are on real, separate, possibly-restrictive networks (the normal
// case once this is actually hosted). The real list - including a TURN relay, if one is
// configured - is fetched from the backend below and used once available.
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const FACE_CHECK_INTERVAL_MS = 4000
const FACE_MISS_STRIKES = 2 // consecutive misses before treating it as a real violation, not one bad frame
const FACE_MODELS_URL = '/models'

const GIVE_UP_PATTERNS = [
  /\bi\s*(?:do\s*not|don'?t)\s*know\b/i,
  /\bno\s*idea\b/i,
  /\bnot\s*sure\b/i,
  /\bnot\s*aware\b/i,
  /\bi\s*(?:can'?t|cannot)\s*answer\s*(?:that|this)?\b/i,
  /\bskip\s*(?:this|it|that)?\b/i,
  /\bi'?ll\s*pass\b/i,
]
const isGiveUpAnswer = (text) => GIVE_UP_PATTERNS.some((re) => re.test((text || '').trim()))

const STOP_PATTERNS = [
  /\bstop\s*(?:the)?\s*interview\b/i,
  /\bend\s*(?:the)?\s*interview\b/i,
  /\b(?:i\s*want\s*to|i'?d\s*like\s*to|please)\s*stop\b/i,
  /\bpause\s*(?:the)?\s*interview\b/i,
  /\bi\s*(?:want|need)\s*to\s*(?:quit|exit)\s*(?:the\s*interview)?\b/i,
]
const isStopRequest = (text) => STOP_PATTERNS.some((re) => re.test((text || '').trim()))

export default function InterviewRoom() {
  const [phase, setPhase] = useState('loading')
  // loading | disclaimer | active | paused | resume-disclaimer | completed | error
  const [session, setSession] = useState(null)
  const [config, setConfig] = useState(null)
  const [jdTitle, setJdTitle] = useState('')
  const [maxQuestions, setMaxQuestions] = useState(12)
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const [infoNotice, setInfoNotice] = useState('')
  const [pendingGiveUp, setPendingGiveUp] = useState(null) // { text, secondsLeft }
  const [micLevel, setMicLevel] = useState(0)
  const [showHint, setShowHint] = useState(true)
  const [exitOpen, setExitOpen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState('')
  const [endedEarly, setEndedEarly] = useState(null) // { answered, planned } once the candidate has left
  const [cameraError, setCameraError] = useState('')
  const [settingUpMedia, setSettingUpMedia] = useState(false)
  const [liveViewConnected, setLiveViewConnected] = useState(false)

  const recognitionRef = useRef(null)
  const pollRef = useRef(null)
  const chatEndRef = useRef(null)
  const disclaimerAcceptedRef = useRef(false)
  const phaseRef = useRef(phase)
  const listeningRef = useRef(listening)
  const micReadyRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const maxListenTimerRef = useRef(null)
  const autoListenDelayRef = useRef(null)
  const giveUpTimerRef = useRef(null)
  const giveUpIntervalRef = useRef(null)
  const micStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const levelRafRef = useRef(null)
  const localVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const pcRef = useRef(null)
  const roomRef = useRef(null)
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS)
  const recorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const faceCheckRef = useRef(null)
  const faceModelsReadyRef = useRef(false)
  const pendingActionRef = useRef('start') // 'start' | 'resume' — which flow retryCamera() should continue with

  const sessionRef = useRef(null)
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    client.get('/candidate/interview/start-info').then(({ data }) => {
      setConfig(data.config)
      setJdTitle(data.jd_title)
      if (data.existing_session && data.existing_session.status === 'paused') {
        setSession(data.existing_session)
        setPhase('paused')
      } else if (data.existing_session && data.existing_session.status === 'in_progress') {
        setSession(data.existing_session)
        setPhase('resume-disclaimer')
      } else {
        setPhase('disclaimer')
      }
    }).catch((err) => {
      setError(err?.response?.data?.error || 'Could not load interview info.')
      setPhase('error')
    })
    return () => {
      stopPolling()
      stopListening()
      stopSpeaking()
      stopMicLevelMeter()
      stopFaceMonitoring()
      teardownLiveViewPeer()
      stopCamera()
      clearTimeout(autoListenDelayRef.current)
      clearTimeout(giveUpTimerRef.current)
      clearInterval(giveUpIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.turns?.length, sending])

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  // Camera + mic are mandatory for this interview: the candidate cannot proceed without
  // granting both. This is a hard gate, unlike the old mic-only soft-check it replaces.
  const setupCameraAndMic = async () => {
    setSettingUpMedia(true); setCameraError('')
    const tryGetMedia = (video) => navigator.mediaDevices.getUserMedia({ video, audio: true })
    try {
      let stream
      try {
        // Preferred: a modest resolution so the recording/upload stays small. "ideal" (not a
        // bare number, which some browsers treat as an exact requirement) so a webcam that
        // can't do exactly 320x240 doesn't fail the whole request over it.
        stream = await tryGetMedia({ width: { ideal: 320 }, height: { ideal: 240 } })
      } catch (e) {
        if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
          // The resolution hint itself was the problem — retry with no video constraints at all.
          stream = await tryGetMedia(true)
        } else {
          throw e
        }
      }
      localStreamRef.current = stream
      attachSelfView()
      micReadyRef.current = true
      return true
    } catch (e) {
      micReadyRef.current = false
      console.error('Camera/mic setup failed:', e.name, e.message)
      setCameraError(
        e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError'
          ? 'No camera was found on this device. A working camera and microphone are required to take this interview.'
          : e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
            ? 'Camera and microphone access is required to take this interview. Please allow access in your browser and try again.'
            : e.name === 'NotReadableError' || e.name === 'TrackStartError'
              ? 'Your camera or microphone could not be started — it may already be in use by another app or browser tab. Please close it and try again.'
              : e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError'
                ? 'Your camera does not support the required settings. Please try a different camera and try again.'
                : `Could not access your camera and microphone (${e.name || 'unknown error'}: ${e.message || 'no further detail'}). Please check your device and try again.`
      )
      return false
    } finally {
      setSettingUpMedia(false)
    }
  }

  const stopCamera = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
  }

  // The self-view <video> element only exists in the 'active' (and resume) screens, not
  // during the camera-check step where the stream is first granted — so attaching the
  // stream can't happen just once, right after getUserMedia resolves. It has to happen
  // again every time that element actually mounts, hence the effect below rather than a
  // single assignment inside setupCameraAndMic.
  const attachSelfView = () => {
    if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }
  useEffect(() => { attachSelfView() }, [phase])

  // --- Continuous recording of the candidate's camera/mic for the whole interview.
  //     Paused (not stopped) across a violation pause so it resumes as ONE file, and only
  //     finalized + uploaded once at completion/exit. ---
  const startRecording = () => {
    if (!localStreamRef.current) return
    try {
      const recorder = new MediaRecorder(localStreamRef.current, { mimeType: 'video/webm;codecs=vp8,opus' })
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.start(1000)
      recorderRef.current = recorder
    } catch (e) {
      // Recording is best-effort; the interview must not depend on it.
    }
  }
  const pauseRecording = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.pause() }
  const resumeRecording = () => { if (recorderRef.current?.state === 'paused') recorderRef.current.resume() }

  const finalizeRecording = async (sessionId) => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    await new Promise((resolve) => { rec.onstop = resolve; rec.stop() })
    recorderRef.current = null
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
    if (blob.size === 0) return
    const fd = new FormData()
    fd.append('file', blob, 'recording.webm')
    try { await client.post(`/candidate/interview/${sessionId}/upload-recording`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
    catch (e) { /* best effort — the interview outcome must not depend on the upload succeeding */ }
  }

  // --- One-way WebRTC broadcast so an admin can watch the candidate live from the session
  //     page, reusing the same signaling relay Live Interview already uses. The candidate
  //     never receives anything back. ---
  const fetchIceServers = async () => {
    try {
      const { data } = await client.get('/webrtc/ice-servers')
      if (Array.isArray(data?.iceServers) && data.iceServers.length) iceServersRef.current = data.iceServers
    } catch (e) {
      // Live view is a bonus for the admin, not a requirement for the interview itself -
      // keep the STUN-only default and carry on.
    }
  }

  const setupLiveViewPeer = (sessionId) => {
    const room = `ai-session-${sessionId}`
    roomRef.current = room
    fetchIceServers()
    const socket = getSocket()

    const makeOfferForViewer = async () => {
      if (!localStreamRef.current || typeof RTCPeerConnection === 'undefined') return
      try {
        pcRef.current?.close()
        const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
        pcRef.current = pc
        localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current))
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit('signal', { room, payload: { type: 'ice-candidate', candidate: e.candidate } }) }
        pc.onconnectionstatechange = () => setLiveViewConnected(pc.connectionState === 'connected')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('signal', { room, payload: { type: 'offer', sdp: offer } })
      } catch (e) {
        // Live view for the admin is a bonus, not a requirement — a WebRTC hiccup here
        // must never affect the interview, the recording, or face monitoring.
      }
    }

    const onSignal = async (payload) => {
      const pc = pcRef.current
      if (!pc) return
      if (payload.type === 'answer') await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      else if (payload.type === 'ice-candidate') { try { await pc.addIceCandidate(payload.candidate) } catch (e) { /* ignore */ } }
    }

    socket.on('peer_joined', makeOfferForViewer)
    socket.on('signal', onSignal)
    socket.emit('join_room', { room, role: 'candidate' })
  }

  const teardownLiveViewPeer = () => {
    const socket = getSocket()
    if (roomRef.current) socket.emit('leave_room', { room: roomRef.current })
    socket.off('peer_joined')
    socket.off('signal')
    pcRef.current?.close()
    pcRef.current = null
    roomRef.current = null
    setLiveViewConnected(false)
  }

  // --- Live face-presence monitoring: 0 faces or >1 faces for a couple of consecutive
  //     checks becomes a real no_face / multi_face violation via the existing pipeline. ---
  const startFaceMonitoring = async () => {
    if (!faceModelsReadyRef.current) {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL)
        faceModelsReadyRef.current = true
      } catch (e) {
        console.warn('Face-detection models failed to load; live face monitoring is disabled for this session.', e)
        return
      }
    }
    let noFaceStrikes = 0
    let multiFaceStrikes = 0
    faceCheckRef.current = setInterval(async () => {
      if (phaseRef.current !== 'active' || !localVideoRef.current || localVideoRef.current.readyState < 2) return
      try {
        const detections = await faceapi.detectAllFaces(localVideoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        if (detections.length === 0) {
          noFaceStrikes += 1; multiFaceStrikes = 0
          if (noFaceStrikes >= FACE_MISS_STRIKES) { noFaceStrikes = 0; reportViolation('no_face') }
        } else if (detections.length > 1) {
          multiFaceStrikes += 1; noFaceStrikes = 0
          if (multiFaceStrikes >= FACE_MISS_STRIKES) { multiFaceStrikes = 0; reportViolation('multi_face') }
        } else {
          noFaceStrikes = 0; multiFaceStrikes = 0
        }
      } catch (e) { /* one failed detection tick must not crash monitoring */ }
    }, FACE_CHECK_INTERVAL_MS)
  }
  const stopFaceMonitoring = () => { if (faceCheckRef.current) { clearInterval(faceCheckRef.current); faceCheckRef.current = null } }

  // --- Live mic level meter (purely visual feedback that the mic is picking up sound) ---
  const startMicLevelMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setMicLevel(Math.min(1, avg / 90))
        levelRafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (e) {
      // The level meter is a nice-to-have; recognition itself still works without it.
    }
  }

  const stopMicLevelMeter = () => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current)
    levelRafRef.current = null
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    setMicLevel(0)
  }

  // --- Silence nudge: gently prompt if listening picks up nothing for a while ---
  const armSilenceTimer = () => {
    clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      setInfoNotice('Still there? Go ahead and speak, or type your answer below.')
    }, SILENCE_NUDGE_MS)
  }
  const clearSilenceTimer = () => { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }

  // --- Safety cap so a single answer can't listen forever ---
  const armMaxListenTimer = () => {
    clearTimeout(maxListenTimerRef.current)
    maxListenTimerRef.current = setTimeout(() => {
      stopListening()
      setInfoNotice('Recording stopped after 5 minutes — tap the mic to keep speaking, or finish typing your answer.')
    }, MAX_LISTEN_MS)
  }
  const clearMaxListenTimer = () => { clearTimeout(maxListenTimerRef.current); maxListenTimerRef.current = null }

  const startAutoListen = () => {
    if (!config?.voice_enabled || !micReadyRef.current || phaseRef.current !== 'active' || listeningRef.current) return
    clearTimeout(autoListenDelayRef.current)
    autoListenDelayRef.current = setTimeout(() => {
      if (phaseRef.current === 'active' && !listeningRef.current) beginListening()
    }, AUTO_LISTEN_DELAY_MS)
  }

  // Delivers a question: speaks it aloud when voice is on, otherwise (or if muted)
  // still hands off to auto-listen so muting the AI's voice doesn't cost the candidate
  // the auto-listen convenience.
  const announceQuestion = (text) => {
    if (!config?.voice_enabled) return
    if (muted) { startAutoListen(); return }
    speak(text, { onEnd: startAutoListen })
  }

  const speakLatest = (s) => {
    const lastAi = [...(s.turns || [])].reverse().find((t) => t.role === 'ai')
    if (!lastAi) return
    announceQuestion(lastAi.content)
  }

  const proceedToStart = async () => {
    await enterFullscreen()
    try {
      const { data } = await client.post('/candidate/interview/start')
      setSession(data.session)
      if (data.total_questions) setMaxQuestions(data.total_questions)
      setPhase('active')
      speakLatest(data.session)
      startRecording()
      setupLiveViewPeer(data.session.id)
      startFaceMonitoring()
    } catch (err) {
      if (err?.response?.status === 423) {
        setSession(err.response.data.session)
        setPhase('paused')
      } else {
        setError(err?.response?.data?.error || 'Could not start the interview.')
        setPhase('error')
      }
    }
  }

  const beginInterview = async () => {
    disclaimerAcceptedRef.current = true
    pendingActionRef.current = 'start'
    setPhase('camera-check')
    const ok = await setupCameraAndMic()
    if (ok) await proceedToStart()
  }

  const continueAfterResumeDisclaimer = async () => {
    disclaimerAcceptedRef.current = true
    if (localStreamRef.current) {
      // Same browser tab the whole way through the pause — camera and live view never
      // stopped, only the recorder did. Just pick both back up.
      await enterFullscreen()
      setPhase('active')
      resumeRecording()
      return
    }
    // The candidate closed/reloaded the tab while paused, so all of that is gone: this is
    // effectively a fresh start. Camera must be re-granted (this becomes a new recording
    // segment — see the note on the upload route about re-uploads replacing the prior file).
    pendingActionRef.current = 'resume'
    setPhase('camera-check')
    const ok = await setupCameraAndMic()
    if (!ok) return
    await enterFullscreen()
    setPhase('active')
    startRecording()
    setupLiveViewPeer(session.id)
    startFaceMonitoring()
  }

  const retryCamera = async () => {
    const ok = await setupCameraAndMic()
    if (!ok) return
    if (pendingActionRef.current === 'start') await proceedToStart()
    else {
      await enterFullscreen()
      setPhase('active')
      startRecording()
      setupLiveViewPeer(session.id)
      startFaceMonitoring()
    }
  }

  const cancelGiveUp = () => {
    clearTimeout(giveUpTimerRef.current)
    clearInterval(giveUpIntervalRef.current)
    setPendingGiveUp(null)
  }

  const armGiveUp = (text) => {
    setPendingGiveUp({ text, secondsLeft: Math.ceil(GIVE_UP_CONFIRM_MS / 1000) })
    giveUpIntervalRef.current = setInterval(() => {
      setPendingGiveUp((p) => (p ? { ...p, secondsLeft: Math.max(0, p.secondsLeft - 1) } : p))
    }, 1000)
    giveUpTimerRef.current = setTimeout(() => {
      clearInterval(giveUpIntervalRef.current)
      setPendingGiveUp(null)
      submitAnswer(text)
    }, GIVE_UP_CONFIRM_MS)
  }

  // Reads sessionRef rather than the closed-over `session` state because this function is
  // called not only from fresh render closures (the tab-switch/paste monitor, which re-syncs
  // its callback every render) but also from the face-detection interval, which is set up
  // ONCE at interview start — in that same tick `session` state is still null, so a version
  // of this function that closed over raw `session` would be permanently broken for it.
  const reportViolation = async (eventType) => {
    const currentSession = sessionRef.current
    if (!currentSession || phaseRef.current !== 'active') return
    stopSpeaking()
    stopListening()
    cancelGiveUp()
    pauseRecording()
    setInfoNotice('')
    try {
      const { data } = await client.post(`/candidate/interview/${currentSession.id}/violation`, { event_type: eventType })
      setSession((s) => ({ ...s, status: data.status }))
      setPhase('paused')
    } catch (e) {
      setPhase('paused')
    }
  }

  // Window-focus loss is only a notice to the admin: the interview keeps running.
  const reportNotice = async (eventType) => {
    if (!session) return
    try { await client.post(`/candidate/interview/${session.id}/violation`, { event_type: eventType }) }
    catch (e) { /* a missed notice must never disturb the candidate */ }
  }

  useIntegrityMonitor({
    active: phase === 'active',
    requireFullscreen: config?.require_fullscreen ?? true,
    watchCopyPaste: true,
    onViolation: reportViolation,
    onNotice: reportNotice,
  })

  useEffect(() => {
    if (phase !== 'paused' || !session) return undefined
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/candidate/interview/${session.id}/status`)
        setSession(data)
        if (data.status === 'in_progress') {
          stopPolling()
          setPhase('resume-disclaimer')
        }
      } catch (e) { /* keep polling */ }
    }, STATUS_POLL_MS)
    return stopPolling
  }, [phase, session?.id])

  const beginListening = async () => {
    if (listeningRef.current) return
    setListening(true)
    setInfoNotice('')
    startMicLevelMeter()
    armSilenceTimer()
    armMaxListenTimer()
    const controller = await startListening({
      onInterim: (text) => { setAnswer(text); armSilenceTimer() },
      onFinal: (text) => {
        setAnswer(text)
        armSilenceTimer()
        if (isStopRequest(text)) {
          requestStop()
          return
        }
        if (isGiveUpAnswer(text)) {
          stopListening()
          armGiveUp(text)
        }
      },
      onError: (err) => { setError(err || 'Voice input failed — please type your answer instead.'); stopListening() },
    })
    recognitionRef.current = controller
  }

  const toggleListening = async () => {
    if (listening) { stopListening(); return }
    await beginListening()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    clearSilenceTimer()
    clearMaxListenTimer()
    stopMicLevelMeter()
  }

  const openExit = () => {
    // Quiet everything that could submit or record while the confirmation is up.
    stopListening()
    cancelGiveUp()
    setExitError('')
    setExitOpen(true)
  }

  const confirmExit = async () => {
    if (exiting || !session) return
    setExiting(true); setExitError('')
    try {
      const { data } = await client.post(`/candidate/interview/${session.id}/exit`, { pending_answer: answer.trim() })
      // Mark the interview as over BEFORE leaving fullscreen, so leaving it is not read as a violation.
      phaseRef.current = 'completed'
      stopSpeaking()
      stopListening()
      cancelGiveUp()
      stopFaceMonitoring()
      teardownLiveViewPeer()
      clearTimeout(autoListenDelayRef.current)
      await finalizeRecording(session.id)
      stopCamera()
      setEndedEarly({ answered: data.answered, planned: data.planned })
      setExitOpen(false)
      setPhase('completed')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    } catch (err) {
      setExitError(err?.response?.data?.error || 'Could not end the interview. Please try again.')
    } finally {
      setExiting(false)
    }
  }

  const requestStop = async () => {
    stopSpeaking()
    stopListening()
    cancelGiveUp()
    pauseRecording()
    if (!session) return
    try {
      await client.post(`/candidate/interview/${session.id}/stop`)
    } catch (e) {
      // Even if the request fails, don't leave the candidate stuck mid-answer.
    }
    setSession((s) => ({ ...s, status: 'paused', pause_reason: 'candidate_stop' }))
    setPhase('paused')
  }

  const submitAnswer = async (overrideText) => {
    const text = (typeof overrideText === 'string' ? overrideText : answer).trim()
    if (!text || sending) return
    if (isStopRequest(text)) { requestStop(); return }
    stopListening()
    cancelGiveUp()
    setSending(true); setError(''); setInfoNotice('')
    setSession((s) => ({ ...s, turns: [...s.turns, { id: `local-${Date.now()}`, role: 'candidate', content: text }] }))
    setAnswer('')
    try {
      const { data } = await client.post(`/candidate/interview/${session.id}/answer`, { answer: text })
      setSession((s) => ({ ...s, turns: [...s.turns, data.turn], status: data.session_status }))
      if (data.session_status === 'completed') {
        setPhase('completed')
        stopListening()
        stopFaceMonitoring()
        teardownLiveViewPeer()
        await finalizeRecording(session.id)
        stopCamera()
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      } else {
        announceQuestion(data.turn.content)
      }
    } catch (err) {
      if (err?.response?.status === 423) { setPhase('paused') }
      else { setError(err?.response?.data?.error || 'Could not submit your answer.') }
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer() }
  }

  if (phase === 'loading') return <div className="card" style={{ textAlign: 'center', padding: 60, margin: 40 }}><span className="spinner dark" /></div>
  if (phase === 'error') return <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}><div className="banner banner-error">{error}</div></div>
  if (phase === 'camera-check') {
    return (
      <div className="interview-shell" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 460, padding: 40 }}>
          {settingUpMedia && (
            <>
              <span className="spinner dark" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 10 }}>Setting up your camera…</h2>
              <p style={{ fontSize: 14 }}>Please allow camera and microphone access when your browser asks.</p>
            </>
          )}
          {!settingUpMedia && cameraError && (
            <>
              <VideoOff size={40} color="var(--red)" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 10 }}>Camera access needed</h2>
              <p style={{ fontSize: 14, marginBottom: 22 }}>{cameraError}</p>
              <button className="btn btn-violet" onClick={retryCamera}>Try again</button>
            </>
          )}
        </div>
      </div>
    )
  }
  if (phase === 'disclaimer') return <InterviewDisclaimer onAccept={beginInterview} />
  if (phase === 'resume-disclaimer') return <InterviewDisclaimer isResumeReminder onAccept={continueAfterResumeDisclaimer} />
  if (phase === 'paused') return <PausedOverlay violationCount={session?.violation_count || 0} reason={session?.pause_reason} />

  if (phase === 'completed') {
    return (
      <div className="interview-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 480, padding: 44 }}>
          <CheckCircle2 size={40} color="var(--green)" style={{ marginBottom: 16 }} />
          <h2 style={{ marginBottom: 10 }}>{endedEarly ? 'Interview ended' : 'Interview complete'}</h2>
          <p style={{ fontSize: 14 }}>
            {!endedEarly && 'Thanks for your time — your responses have been recorded and your admin will review the results.'}
            {endedEarly && endedEarly.answered > 0 && `You left the interview early. The ${endedEarly.answered} answer${endedEarly.answered === 1 ? '' : 's'} you gave ${endedEarly.answered === 1 ? 'has' : 'have'} been submitted and your admin will review ${endedEarly.answered === 1 ? 'it' : 'them'}.`}
            {endedEarly && endedEarly.answered === 0 && 'You left before answering any question, so there is nothing to review.'}
          </p>
          <Link to="/app" className="btn btn-violet" style={{ marginTop: 22, display: 'inline-flex' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  const questionsDone = session?.turns?.filter((t) => t.role === 'candidate').length || 0
  const unsentAnswer = answer.trim().length > 0
  const answeredForExit = questionsDone + (unsentAnswer ? 1 : 0)
  const micRingSpread = 4 + micLevel * 12
  const micRingOpacity = 0.18 + micLevel * 0.35

  return (
    <div className="interview-shell">
      <div className="self-view-tile">
        <video ref={localVideoRef} autoPlay playsInline muted />
        <span className="self-view-label">You</span>
        <span className="self-view-rec"><span className="dot" /> REC</span>
        {liveViewConnected && <span className="self-view-live" title="An admin is watching this interview live"><ShieldAlert size={11} /> Admin viewing</span>}
      </div>

      <div className="interview-topbar">
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>AI Interview</div>
          <div className="role-label">{jdTitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="interview-progress-pill">Question {Math.min(questionsDone + 1, maxQuestions)} of {maxQuestions}</div>
          {config?.voice_enabled && (
            <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute interviewer voice' : 'Mute interviewer voice'}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
          <button className="exit-btn" onClick={openExit} disabled={sending} title="End the interview and submit your answers so far">
            <LogOut size={15} /> Exit
          </button>
        </div>
      </div>

      {showHint && (
        <div className="interview-hint-bar">
          <span className="hint-text">
            <Info size={14} />
            {config?.voice_enabled
              ? 'Speak after each question — we\u2019ll start listening automatically. Press Enter or tap Send to submit. Say \u201cI don\u2019t know\u201d to skip a question.'
              : 'Type your answer below, then press Enter or tap Send to submit. Say \u201cI don\u2019t know\u201d if you want to skip a question.'}
          </span>
          <button onClick={() => setShowHint(false)} title="Dismiss"><X size={15} /></button>
        </div>
      )}

      <div className="interview-chat">
        {session?.turns?.map((t) => (
          <div key={t.id} className={`chat-bubble ${t.role}`}>
            <span className="speaker-label">{t.role === 'ai' ? 'Interviewer' : 'You'}</span>
            {t.content}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble ai thinking" role="status" aria-live="polite">
            <span className="speaker-label">Interviewer</span>
            <span className="thinking-row">
              Reviewing your answer
              <span className="thinking-dots" aria-hidden="true"><span /><span /><span /></span>
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={{ position: 'fixed', bottom: 100, left: 0, right: 0, maxWidth: 760, margin: '0 auto', padding: '0 20px', display: 'grid', gap: 10 }}>
        {error && <div className="banner banner-error">{error}</div>}
        {infoNotice && <div className="banner banner-info">{infoNotice}</div>}
        {pendingGiveUp && (
          <div className="giveup-chip">
            <span>Submitting your answer as &ldquo;{pendingGiveUp.text}&rdquo; in {pendingGiveUp.secondsLeft}s&hellip;</span>
            <button onClick={cancelGiveUp}>Cancel</button>
          </div>
        )}
      </div>

      {exitOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={() => !exiting && setExitOpen(false)}>
          <div className="modal-panel" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="exit-title">End the interview now?</h3>
              <button className="icon-btn" onClick={() => setExitOpen(false)} disabled={exiting} aria-label="Close"><X size={18} /></button>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              {answeredForExit > 0
                ? `Your ${answeredForExit} answer${answeredForExit === 1 ? '' : 's'} so far will be submitted and the interview will be marked as completed.`
                : "You haven’t answered any question yet, so there will be nothing to review."}
              {' '}You won&rsquo;t be able to continue it afterwards.
            </p>
            {unsentAnswer && <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 8 }}>The answer you were typing or speaking is included.</p>}
            {exitError && <div className="banner banner-error" style={{ marginTop: 12 }}>{exitError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => setExitOpen(false)} disabled={exiting}>Keep going</button>
              <button className="btn btn-violet" onClick={confirmExit} disabled={exiting}>
                {exiting ? <><span className="spinner" /> Ending…</> : 'End interview'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="interview-input-bar">
        <div className="interview-input-inner">
          <button
            className={`mic-btn ${listening ? 'recording' : ''}`}
            onClick={toggleListening}
            disabled={sending}
            title={listening ? 'Stop listening' : 'Start voice input'}
            style={listening ? { boxShadow: `0 0 0 ${micRingSpread}px rgba(231,76,60,${micRingOpacity})` } : undefined}
          >
            {listening ? <MicOff size={19} /> : <Mic size={19} />}
          </button>
          <textarea
            rows={1} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Type or speak your answer…" disabled={sending}
            style={{ maxHeight: 120 }}
          />
          <button className="send-btn" onClick={() => submitAnswer()} disabled={sending || !answer.trim()} title="Send answer">
            {sending ? <span className="spinner" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
