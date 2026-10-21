import { useEffect, useState } from 'react'
import { KeyRound, Save, Mic, PlugZap, Eraser, Mail } from 'lucide-react'
import client from '../../api/client'
import '../../styles/shared.css'

export default function AdminSettings() {
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [azureKey, setAzureKey] = useState('')
  const [azureRegion, setAzureRegion] = useState('')
  const [smtp, setSmtp] = useState({
    host: 'smtp.zauca.in', port: '465', username: 'anushach@acknowledgerfirst.com',
    fromEmail: 'anushach@acknowledgerfirst.com', password: '', passwordSet: false,
    useSsl: true, useTls: false,
  })
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [smtpTestResult, setSmtpTestResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    client.get('/admin/settings').then((r) => {
      setStatus(r.data)
      setModel(r.data.anthropic_model)
      setAzureRegion(r.data.azure_speech_region || '')
      setSmtp((current) => ({
        ...current,
        host: r.data.smtp_host || '',
        port: String(r.data.smtp_port || 465),
        username: r.data.smtp_username || '',
        fromEmail: r.data.smtp_from_email || '',
        passwordSet: r.data.smtp_password_set,
        useSsl: r.data.smtp_use_ssl,
        useTls: r.data.smtp_use_tls,
      }))
    })
  }
  useEffect(load, [])

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await client.post('/admin/settings', {
        anthropic_api_key: apiKey || undefined, anthropic_model: model,
        azure_speech_key: azureKey || undefined, azure_speech_region: azureRegion || undefined,
        smtp_host: smtp.host, smtp_port: smtp.port, smtp_username: smtp.username,
        smtp_from_email: smtp.fromEmail, smtp_password: smtp.password || undefined,
        smtp_use_ssl: smtp.useSsl, smtp_use_tls: smtp.useTls,
      })
      setNotice('Settings saved. New requests will use these immediately.'); setApiKey(''); setAzureKey(''); setSmtp((current) => ({ ...current, password: '' })); setTestResult(null); setSmtpTestResult(null); load()
    } catch (err) { setError(err?.response?.data?.error || 'Could not save settings.') }
    finally { setSaving(false) }
  }

  const testSmtp = async () => {
    setTesting(true); setSmtpTestResult(null); setError('')
    try {
      const { data } = await client.post('/admin/settings/test-smtp')
      setSmtpTestResult(data)
    } catch (err) {
      setSmtpTestResult({ ok: false, error: err?.response?.data?.error || 'SMTP connection failed.' })
    } finally {
      setTesting(false)
    }
  }

  const testAnthropic = async () => {
    setTesting(true); setTestResult(null)
    try {
      const { data } = await client.post('/admin/settings/test-anthropic')
      setTestResult(data)
    } catch (err) {
      setTestResult({ ok: false, error: err?.response?.data?.error || 'Request failed.' })
    } finally {
      setTesting(false)
    }
  }

  const clearAnthropicKey = async () => {
    if (!confirm("Clear the saved Anthropic key from the database? The app will fall back to whatever ANTHROPIC_API_KEY is set in the backend's .env file.")) return
    setClearing(true); setError(''); setNotice('')
    try {
      await client.post('/admin/settings/clear-anthropic-key')
      setNotice('Cleared. Now falling back to the .env file — test the connection to confirm it works.')
      setTestResult(null)
      load()
    } catch (err) {
      setError('Could not clear the stored key.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Admin</span>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure the Anthropic key used across JD parsing, prep generation, resume tailoring, and interview report generation — plus Azure Speech for the AI interview's voice.</p>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 20, maxWidth: 560 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--violet-050)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><KeyRound size={17} color="var(--violet-600)" /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Anthropic API</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
                {status?.anthropic_api_key_set
                  ? <>Currently set <strong>in the database</strong>: {status.anthropic_api_key_masked} — this always overrides <code>.env</code></>
                  : "No key saved in the database — using the backend .env file's ANTHROPIC_API_KEY, if any."}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="field"><label>API key</label><input className="input" type="password" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
            <div className="field"><label>Model</label><input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-6" /></div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={testAnthropic} disabled={testing}>
              {testing ? <span className="spinner dark" /> : <PlugZap size={14} />} Test connection
            </button>
            {status?.anthropic_api_key_set && (
              <button type="button" className="btn btn-outline btn-sm" onClick={clearAnthropicKey} disabled={clearing}>
                {clearing ? <span className="spinner dark" /> : <Eraser size={14} />} Clear stored key (use .env instead)
              </button>
            )}
          </div>
          <p style={{ fontSize: 11.5, marginTop: 8, color: 'var(--ink-faint)' }}>
            Save your key first if you just changed it — Test connection checks whichever key is currently
            active. If a bad key ever got saved here, editing your <code>.env</code> file alone won't fix it —
            the database value always wins, so use "Clear stored key" to fall back to <code>.env</code>.
          </p>
          {testResult && (
            <div className={`banner ${testResult.ok ? 'banner-success' : 'banner-error'}`} style={{ marginTop: 10, marginBottom: 0 }}>
              {testResult.ok
                ? `Connected — model "${testResult.model}" responded: "${testResult.sample_response}"`
                : `Failed: ${testResult.error}`}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#E7EFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={17} color="#2E6BE6" /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Azure Speech (interview voice)</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>{status?.azure_speech_key_set ? `Currently set: ${status.azure_speech_key_masked} · region ${status.azure_speech_region}` : "Not configured — AI interview voice will fall back to the browser's built-in speech."}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="field"><label>Speech resource key</label><input className="input" type="password" placeholder="Azure Speech subscription key" value={azureKey} onChange={(e) => setAzureKey(e.target.value)} /></div>
            <div className="field"><label>Region</label><input className="input" value={azureRegion} onChange={(e) => setAzureRegion(e.target.value)} placeholder="e.g. eastus, centralindia" /></div>
          </div>
          <p style={{ fontSize: 11.5, marginTop: 10, color: 'var(--ink-faint)' }}>Find these in your Azure Portal under the Speech resource → Keys and Endpoint.</p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--violet-050)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mail size={17} color="var(--violet-600)" /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>SMTP (candidate credentials)</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
                {smtp.passwordSet ? 'Mailbox password is saved. Enter a new password only to replace it.' : 'Enter the mailbox password to enable credential emails.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="form-grid">
              <div className="field"><label>Outgoing server</label><input className="input" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" /></div>
              <div className="field"><label>SMTP port</label><input className="input" type="number" min={1} max={65535} value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} /></div>
            </div>
            <div className="field"><label>Email account / username</label><input className="input" type="email" autoComplete="username" value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} /></div>
            <div className="field"><label>Mailbox password</label><input className="input" type="password" autoComplete="new-password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.passwordSet ? 'Saved — leave blank to keep current password' : 'Email account password'} /></div>
            <div className="field"><label>From email</label><input className="input" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={smtp.useSsl} onChange={(e) => setSmtp({ ...smtp, useSsl: e.target.checked, useTls: e.target.checked ? false : smtp.useTls })} /> Use SSL (recommended for port 465)</label>
            {!smtp.useSsl && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={smtp.useTls} onChange={(e) => setSmtp({ ...smtp, useTls: e.target.checked })} /> Use STARTTLS</label>}
          </div>
          <p style={{ fontSize: 11.5, marginTop: 10, color: 'var(--ink-faint)' }}>The password is encrypted before being stored in the application settings database and is never returned to the browser. Do not share it or add it to source code.</p>
          <p style={{ fontSize: 11.5, marginTop: 10, color: 'var(--ink-faint)' }}>Save settings before testing the connection so the test uses the latest values.</p>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={testSmtp} disabled={testing || saving}>
              {testing ? <span className="spinner dark" /> : <PlugZap size={14} />} Test SMTP connection
            </button>
          </div>
          {smtpTestResult && (
            <div className={`banner ${smtpTestResult.ok ? 'banner-success' : 'banner-error'}`} style={{ marginTop: 10, marginBottom: 0 }}>
              {smtpTestResult.ok ? smtpTestResult.message : `Failed: ${smtpTestResult.error}`}
            </div>
          )}
        </div>

        {notice && <div className="banner banner-success">{notice}</div>}
        {error && <div className="banner banner-error">{error}</div>}
        <button type="submit" className="btn btn-violet" style={{ justifySelf: 'start' }} disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </div>
  )
}
