import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import '../../styles/shared.css'

export default function ChangePassword() {
  const { refreshMe } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const confirmationMismatch = confirm.length > 0 && newPassword !== confirm

  const submit = async (e) => {
    e.preventDefault(); setError(''); setNotice('')
    if (newPassword !== confirm) { setError('New password and confirmation do not match.'); return }
    setSaving(true)
    try {
      await client.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword, confirm_password: confirm })
      setNotice('Password updated successfully.'); setCurrentPassword(''); setNewPassword(''); setConfirm(''); refreshMe()
    } catch (err) { setError(err?.response?.data?.error || 'Could not update your password.') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div><span className="page-eyebrow">Account</span><h1 className="page-title">Change password</h1><p className="page-subtitle">Pick something only you know — you'll use it every time you sign in.</p></div>
      </div>
      <form className="card" style={{ maxWidth: 420, display: 'grid', gap: 14 }} onSubmit={submit}>
        <div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" className="input" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
        <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" className="input" type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
        <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className="input" type="password" autoComplete="new-password" required minLength={6} aria-invalid={confirmationMismatch} value={confirm} onChange={(e) => setConfirm(e.target.value)} />{confirmationMismatch && <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>Passwords do not match.</span>}</div>
        {error && <div className="banner banner-error">{error}</div>}
        {notice && <div className="banner banner-success">{notice}</div>}
        <button type="submit" className="btn btn-violet" style={{ justifySelf: 'start' }} disabled={saving}><KeyRound size={15} /> {saving ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  )
}
