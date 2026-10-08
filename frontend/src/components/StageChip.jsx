import { STAGE_LABEL } from './stages'
import '../styles/hub.css'

export default function StageChip({ stage, label }) {
  return <span className={`stage-chip tone-${stage}`}><span className="dot" />{label || STAGE_LABEL[stage] || stage}</span>
}

export function PipeBar({ pipeline = {}, total }) {
  const sum = total ?? Object.values(pipeline).reduce((a, b) => a + b, 0)
  if (!sum) return <div className="pipebar" aria-label="No candidates yet" />
  const order = ['profile', 'practice', 'questions', 'ready', 'live', 'awaiting_review', 'reviewed', 'shared']
  return (
    <div className="pipebar" role="img" aria-label="Candidates by stage">
      {order.map((k) => (pipeline[k] ? <span key={k} className={`s-${k}`} style={{ width: `${(pipeline[k] / sum) * 100}%` }} title={`${STAGE_LABEL[k]}: ${pipeline[k]}`} /> : null))}
    </div>
  )
}
