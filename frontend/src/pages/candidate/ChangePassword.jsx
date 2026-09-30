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

  const submit = async (e) => {
    e.preventDefault(); setError(''); setNotice('')
    if (newPassword !== confirm) { setError('New password and confirmation do not match.'); return }
    setSaving(true)
    try {
      await client.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
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
        <div className="field"><label>Current password</label><input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
        <div className="field"><label>New password</label><input className="input" type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
        <div className="field"><label>Confirm new password</label><input className="input" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        {error && <div className="banner banner-error">{error}</div>}
        {notice && <div className="banner banner-success">{notice}</div>}
        <button type="submit" className="btn btn-violet" style={{ justifySelf: 'start' }} disabled={saving}><KeyRound size={15} /> {saving ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  )
}
