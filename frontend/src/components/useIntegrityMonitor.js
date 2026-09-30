import { useEffect, useRef } from 'react'

// Focus-loss style events are reported but never stop the interview, and are throttled
// because they fire constantly (clicking the address bar, another window, a dialog...).
const NOTICE_THROTTLE_MS = 15000

export function useIntegrityMonitor({ active, requireFullscreen = true, watchCopyPaste = true, onViolation, onNotice }) {
  const firedRef = useRef(false)
  const lastNoticeRef = useRef(0)
  const onViolationRef = useRef(onViolation)
  onViolationRef.current = onViolation
  const onNoticeRef = useRef(onNotice)
  onNoticeRef.current = onNotice

  const trigger = (type) => {
    if (!active || firedRef.current) return
    firedRef.current = true
    onViolationRef.current?.(type)
  }

  // Deliberately does NOT touch firedRef: a notice must never use up the one-shot
  // latch, or the next real violation (tab switch, fullscreen exit...) would be swallowed.
  const notice = (type) => {
    if (!active) return
    const now = Date.now()
    if (now - lastNoticeRef.current < NOTICE_THROTTLE_MS) return
    lastNoticeRef.current = now
    onNoticeRef.current?.(type)
  }

  useEffect(() => {
    if (active) firedRef.current = false
  }, [active])

  useEffect(() => {
    if (!active) return undefined

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') trigger('tab_switch')
    }
    const handleBlur = () => {
      setTimeout(() => {
        if (document.visibilityState === 'visible' && !document.hasFocus()) notice('window_blur')
      }, 250)
    }
    const handleFullscreenChange = () => {
      if (requireFullscreen && !document.fullscreenElement) trigger('fullscreen_exit')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    const devtoolsThreshold = 160
    const checkDevtools = setInterval(() => {
      const widthGap = window.outerWidth - window.innerWidth
      const heightGap = window.outerHeight - window.innerHeight
      if (widthGap > devtoolsThreshold || heightGap > devtoolsThreshold) trigger('devtools')
    }, 1500)

    let handlePaste
    if (watchCopyPaste) {
      handlePaste = (e) => {
        const tag = e.target?.tagName
        if (tag === 'TEXTAREA' || tag === 'INPUT') trigger('copy_paste')
      }
      document.addEventListener('paste', handlePaste)
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      clearInterval(checkDevtools)
      if (handlePaste) document.removeEventListener('paste', handlePaste)
    }
  }, [active, requireFullscreen, watchCopyPaste])
}

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    }
  } catch (e) { /* denied is fine */ }
}
