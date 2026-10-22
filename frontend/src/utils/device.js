// Which roles may only use the app from a computer. The interview needs a camera,
// fullscreen and tab-focus monitoring, which phones and tablets can't provide reliably.
// Admins are not listed: the admin portal is built to work on a phone.
// To keep admins off phones as well, add 'admin' here.
export const DESKTOP_ONLY_ROLES = ['candidate']

/** True on phones and tablets (including "request desktop site" mode on a touch-only device). */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  try {
    if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true
    const ua = navigator.userAgent || ''
    if (/Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile|Mobile|Tablet|Silk|Kindle/i.test(ua)) return true
    // iPadOS 13+ identifies itself as a Mac but has a touch screen.
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
    // "Request desktop site" hides the user agent; a touch-only device has no fine pointer at all.
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches) return true
    }
  } catch (e) { /* treat as desktop */ }
  return false
}

export const mustUseDesktop = (role) => DESKTOP_ONLY_ROLES.includes(role) && isMobileDevice()
