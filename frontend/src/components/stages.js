// Shared vocabulary for the role-centred admin: stages, verdicts, where an action leads.
// The stage itself is computed by the backend (services/pipeline.py) - this file only
// describes how to present it, so every screen shows the same words in the same order.

export const STAGE_ORDER = ['profile', 'practice', 'questions', 'ready', 'live', 'awaiting_review', 'reviewed', 'shared']

export const STAGE_LABEL = {
  profile: 'Profile incomplete',
  practice: 'Practice',
  questions: 'Questions',
  ready: 'Ready to interview',
  live: 'Interview in progress',
  awaiting_review: 'Awaiting review',
  reviewed: 'Reviewed',
  shared: 'Shared',
}

// Short labels for the pipeline strip.
export const STAGE_SHORT = {
  profile: 'Profile', practice: 'Practice', questions: 'Questions', ready: 'Ready',
  live: 'Live now', awaiting_review: 'To review', reviewed: 'Reviewed', shared: 'Shared',
}

export const BOARD_LANES = [
  { key: 'prepare', title: 'Prepare', stages: ['profile', 'practice', 'questions'] },
  { key: 'interview', title: 'Interview', stages: ['ready', 'live'] },
  { key: 'review', title: 'Review', stages: ['awaiting_review', 'reviewed'] },
  { key: 'done', title: 'Done', stages: ['shared'] },
]

export const VERDICTS = [
  { key: 'proceed', label: 'Proceed', hint: 'Strong enough to move forward in the process.' },
  { key: 'hold', label: 'Hold', hint: 'Undecided - keep on file and revisit.' },
  { key: 'reject', label: 'Reject', hint: 'Not moving forward. This does not affect their login.' },
  { key: 're_interview', label: 'Re-interview', hint: 'Grants exactly one more attempt.' },
]
export const verdictLabel = (v) => (VERDICTS.find((x) => x.key === v) || {}).label || v || ''

// The candidate-page step that holds each stage's work.
export const STEP_FOR_STAGE = {
  profile: 'profile', practice: 'practice', questions: 'questions', ready: 'interview', live: 'interview',
  awaiting_review: 'review', reviewed: 'share', shared: 'share',
}

export function stepsFor(mode) {
  return mode === 'practice'
    ? [{ key: 'profile', label: 'Profile' }, { key: 'practice', label: 'Practice' }]
    : [
        { key: 'profile', label: 'Profile' }, { key: 'questions', label: 'Questions' },
        { key: 'interview', label: 'Interview' }, { key: 'review', label: 'Review' }, { key: 'share', label: 'Share' },
      ]
}

// Where the main action button on a candidate row leads (copy_invite is handled in place).
export function actionPath(c) {
  const base = `/admin/users/${c.id}`
  switch (c.action?.type) {
    case 'add_resume': return `${base}?step=profile`
    case 'generate_questions':
    case 'review_questions': return `${base}?step=questions`
    case 'open_candidate': return `${base}?step=practice`
    case 'watch_live':
    case 'generate_report': return c.session_id ? `/admin/interview-sessions/${c.session_id}` : base
    case 'review_report': return `${base}?step=review`
    case 'share_report': return `${base}?step=share`
    case 'view_report': return `${base}?step=share`
    default: return base
  }
}

export function inviteText(c, extra = {}) {
  const first = (c.name || c.username || '').split(' ')[0]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const lines = [
    `Hi ${first},`,
    '',
    c.mode === 'practice'
      ? `Your Code2Hire practice space${c.jd_title ? ` for the ${c.jd_title} role` : ''} is ready.`
      : `Your Code2Hire interview${c.jd_title ? ` for the ${c.jd_title} role` : ''} is ready.`,
    `Sign in at ${origin}`,
    `Username: ${c.username}`,
  ]
  if (extra.password) lines.push(`Temporary password: ${extra.password} (you will be asked to change it)`)
  else lines.push('Password: the one we shared when your account was created (ask us to reset it if you lost it).')
  if (c.mode !== 'practice') lines.push('', 'Use a laptop or desktop with a working camera and microphone, in a quiet place.')
  return lines.join('\n')
}

// Wraps every case-insensitive occurrence of a search token in <mark> (returns React nodes).
import { createElement, Fragment } from 'react'
export function highlight(text, tokens) {
  if (!text) return text
  const toks = (tokens || []).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!toks.length) return text
  const re = new RegExp(`(${toks.join('|')})`, 'gi')
  const parts = String(text).split(re)
  return createElement(Fragment, null, parts.map((p, i) => (i % 2 === 1 ? createElement('mark', { key: i }, p) : p)))
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
export function fmtWhen(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

// Pinned roles are a per-browser convenience (not shared), so localStorage is the right home.
const PIN_KEY = 'c2h_pinned_roles'
const RECENT_KEY = 'c2h_recent_roles'
const readList = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const writeList = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode: ignore */ } }
export const getPinned = () => readList(PIN_KEY)
export const togglePinned = (id) => { const cur = readList(PIN_KEY); const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur]; writeList(PIN_KEY, next); return next }
export const getRecent = () => readList(RECENT_KEY)
export const pushRecent = (id) => { writeList(RECENT_KEY, [id, ...readList(RECENT_KEY).filter((x) => x !== id)].slice(0, 6)) }
