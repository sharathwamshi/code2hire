import { useEffect, useRef } from 'react'
import { Check, Lock } from 'lucide-react'
import { stepsFor, STEP_FOR_STAGE } from './stages'
import '../styles/hub.css'

/**
 * Profile -> Questions -> Interview -> Review -> Share (Practice: Profile -> Practice).
 * Steps up to the candidate's current one can be opened; later ones are locked, with the
 * reason on hover, so nobody can skip a mandatory review.
 */
export default function CandidateStepper({ state, viewing, onPick }) {
  const steps = stepsFor(state.mode)
  const currentKey = STEP_FOR_STAGE[state.stage]
  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === currentKey))
  const shared = state.stage === 'shared'
  const railRef = useRef(null)

  // On a narrow screen the steps scroll sideways; keep the one being viewed in sight.
  useEffect(() => {
    const el = railRef.current?.querySelector('.step.viewing')
    if (!el || !railRef.current) return
    const rail = railRef.current
    const left = el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2
    try {
      if (typeof rail.scrollTo === 'function') rail.scrollTo({ left, behavior: 'smooth' })
      else rail.scrollLeft = left
    } catch (e) { /* purely cosmetic */ }
  }, [viewing])

  return (
    <div className="stepper" ref={railRef} role="tablist" aria-label="Candidate progress">
      {steps.map((s, i) => {
        const done = i < currentIdx || (shared && s.key === 'share')
        const current = i === currentIdx && !done
        const locked = i > currentIdx
        const cls = ['step', done ? 'done' : '', current ? 'current' : '', locked ? 'locked' : '', viewing === s.key ? 'viewing' : ''].join(' ')
        return (
          <button key={s.key} className={cls} role="tab" aria-selected={viewing === s.key} aria-disabled={locked}
            disabled={locked} onClick={() => onPick(s.key)}
            title={locked ? (state.blocker || 'Finish the earlier steps first') : undefined}>
            <span className="bub">{done ? <Check size={14} /> : locked ? <Lock size={11} /> : i + 1}</span>
            <span>
              <div className="lb">{s.label}</div>
              <div className="sb">{done ? 'Done' : current ? 'Current' : 'Locked'}</div>
            </span>
          </button>
        )
      })}
    </div>
  )
}
