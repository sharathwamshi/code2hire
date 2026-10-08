import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import client from '../api/client'
import '../styles/shared.css'

const empty = { title: '', company: '', content: '' }

/** Create or edit a role (job description). Required skills are extracted automatically. */
export default function RoleFormModal({ open, role, onClose, onSaved }) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [savedRole, setSavedRole] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(role ? { title: role.title, company: role.company || '', content: role.content || '' } : empty)
      setError(''); setWarning(''); setSavedRole(null)
    }
  }, [open, role])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setWarning('')
    try {
      let saved
      if (role) {
        const { data } = await client.put(`/admin/jds/${role.id}`, form)
        saved = data.jd
      } else {
        const { data } = await client.post('/admin/jds', form)
        saved = data.jd
        if (data.warning) { setWarning(data.warning); setSavedRole(saved); onSaved?.(saved, { stay: true }); return }
      }
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save this role.')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={role ? 'Edit role' : 'New role'}>
        <div className="modal-header">
          <h3>{role ? 'Edit role' : 'New role'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
          <div className="form-grid">
            <div className="field"><label>Role title</label>
              <input className="input" required autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Backend Engineer" />
            </div>
            <div className="field"><label>Company / team (optional)</label>
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Acme Bank - Platform" />
            </div>
            <div className="field field-full"><label>Job description</label>
              <textarea className="input" required rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Paste the complete JD. Required skills are picked out automatically and become searchable." />
            </div>
          </div>
          {error && <div className="banner banner-error" style={{ marginBottom: 0 }}>{error}</div>}
          {warning && <div className="banner banner-info" style={{ marginBottom: 0 }}>{warning}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>{savedRole ? 'Close' : 'Cancel'}</button>
            {!savedRole && <button type="submit" className="btn btn-violet" disabled={saving}>{saving ? <><span className="spinner" /> Saving...</> : (role ? 'Save changes' : 'Create role')}</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
