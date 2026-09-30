import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import client from './client'

let cachedToken = null

async function getSpeechCredentials() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken

  const { data } = await client.get('/candidate/interview/speech-token')
  if (!data.configured) return null

  cachedToken = { token: data.token, region: data.region, voice: data.voice, expiresAt: now + 8 * 60 * 1000 }
  return cachedToken
}

// eslint-disable-next-line no-misleading-character-class
const EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu

export function sanitizeForSpeech(text) {
  if (!text) return text
  return text
    .replace(EMOJI_REGEX, '')
    .replace(/[*_`#]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/([!?,.;:—-])\1{1,}/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

let activeSynthesizer = null

export async function speak(text, { onEnd } = {}) {
  const clean = sanitizeForSpeech(text)
  if (!clean) { onEnd?.(); return }

  const creds = await getSpeechCredentials()

  if (creds) {
    try {
      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(creds.token, creds.region)
      speechConfig.speechSynthesisVoiceName = creds.voice
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig)
      activeSynthesizer = synthesizer
      synthesizer.speakTextAsync(
        clean,
        () => { if (activeSynthesizer === synthesizer) activeSynthesizer = null; synthesizer.close(); onEnd?.() },
        (err) => { if (activeSynthesizer === synthesizer) activeSynthesizer = null; synthesizer.close(); console.warn('Azure TTS failed, falling back:', err); speakBrowser(clean, onEnd) }
      )
      return
    } catch (e) {
      console.warn('Azure TTS setup failed, falling back to browser voice:', e)
    }
  }
  speakBrowser(clean, onEnd)
}

function speakBrowser(text, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 1
  utter.onend = () => onEnd?.()
  window.speechSynthesis.speak(utter)
}

export function stopSpeaking() {
  if (activeSynthesizer) {
    try { activeSynthesizer.close() } catch (e) { /* already closed */ }
    activeSynthesizer = null
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

export async function startListening({ onInterim, onFinal, onError }) {
  const creds = await getSpeechCredentials()

  if (creds) {
    try {
      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(creds.token, creds.region)
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)

      let finalText = ''
      recognizer.recognizing = (s, e) => onInterim?.((finalText + ' ' + e.result.text).trim())
      recognizer.recognized = (s, e) => {
        if (e.result.text) {
          finalText = (finalText + ' ' + e.result.text).trim()
          onFinal?.(finalText)
        }
      }
      recognizer.canceled = (s, e) => onError?.(e.errorDetails)

      recognizer.startContinuousRecognitionAsync()
      return { stop: () => recognizer.stopContinuousRecognitionAsync(() => recognizer.close()), engine: 'azure' }
    } catch (e) {
      console.warn('Azure STT setup failed, falling back to browser voice input:', e)
    }
  }

  return startListeningBrowser({ onInterim, onFinal, onError })
}

function startListeningBrowser({ onInterim, onFinal, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError?.('Voice input is not supported in this browser, and Azure Speech is not configured.')
    return { stop: () => {}, engine: 'none' }
  }
  const rec = new SpeechRecognition()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = 'en-US'
  let finalText = ''
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript
      if (e.results[i].isFinal) { finalText += transcript; onFinal?.(finalText) }
      else interim += transcript
    }
    if (interim) onInterim?.(finalText + interim)
  }
  let stopped = false
  rec.onerror = (e) => {
    // 'no-speech' / 'aborted' just mean a quiet moment - the onend below restarts listening.
    if (e.error === 'no-speech' || e.error === 'aborted') return
    stopped = true
    onError?.(e.error)
  }
  // Browsers end a "continuous" session on their own after a pause; keep listening until
  // we are explicitly told to stop, so a long or hesitant answer is never cut short.
  rec.onend = () => { if (!stopped) { try { rec.start() } catch (e) { /* already restarting */ } } }
  rec.start()
  return { stop: () => { stopped = true; rec.stop() }, engine: 'browser' }
}

export async function isAzureConfigured() {
  const creds = await getSpeechCredentials()
  return !!creds
}
