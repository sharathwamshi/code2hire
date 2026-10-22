import '../styles/shared.css'
import ReportScoreCard from './ReportScoreCard'

function PointList({ title, items }) {
  return (
    <div>
      <div className="page-eyebrow">{title}</div>
      {items?.length > 0
        ? <ul style={{ fontSize: 13, paddingLeft: 18, margin: '6px 0 0' }}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
        : <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>—</p>}
    </div>
  )
}

/**
 * One report, two audiences. `audience="admin"` shows everything, including the hiring
 * recommendation and the selection rationale. `audience="candidate"` shows the evaluation
 * only - the server already omits those two fields for candidates, this is a second guard.
 */
export default function ReportView({ report, audience = 'admin', review = null, name = '', subtitle = '' }) {
  const isAdmin = audience === 'admin'
  const summary = report.summary || {}

  return (
    <div>
      <ReportScoreCard report={report} audience={audience} review={review} name={name} subtitle={subtitle} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <PointList title="Key strengths" items={summary.key_strengths} />
        <PointList title="Areas for improvement" items={summary.areas_for_improvement} />
        <PointList title="Technical skills" items={summary.technical_skills} />
        <PointList title="Soft skills" items={summary.soft_skills} />
      </div>

      {isAdmin && summary.reason_for_selection && (
        <div className="banner banner-info" style={{ marginBottom: 20 }}>{summary.reason_for_selection}</div>
      )}

      <div className="page-eyebrow" style={{ marginBottom: 10 }}>Questions &amp; answers ({report.qna?.length || 0})</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {report.qna?.map((qa, i) => (
          <div key={i} className="card" style={{ background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="badge badge-neutral">{qa.topic}</span>
              <span className={`badge ${qa.score_pct >= 70 ? 'badge-low' : qa.score_pct >= 40 ? 'badge-medium' : 'badge-high'}`}>{qa.score_pct}%</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{qa.question}</div>
            <div style={{ fontSize: 12.5, background: 'var(--violet-050)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <strong>{isAdmin ? 'Candidate:' : 'Your answer:'}</strong> {qa.candidate_answer}
            </div>
            <div style={{ fontSize: 12.5, background: '#EAF6EF', borderRadius: 8, padding: '8px 10px' }}>
              <strong>Reference:</strong> {qa.reference_answer}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
