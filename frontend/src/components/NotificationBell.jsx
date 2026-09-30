import { useEffect, useRef, useState } from 'react'
import { Bell, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import '../styles/shared.css'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const ref = useRef(null)

  const load = () => client.get('/admin/notifications').then((r) => setNotifications(r.data)).catch(() => {})

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markAllRead = async () => {
    await client.post('/admin/notifications/read-all')
    load()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="notif-bell" onClick={() => setOpen((o) => !o)}>
        <Bell size={20} color="var(--ink-soft)" />
        {unreadCount > 0 && <span className="notif-dot" />}
      </div>
      {open && (
        <div className="notif-dropdown">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
            <strong style={{ fontSize: 13.5 }}>Notifications</strong>
            {unreadCount > 0 && <button className="btn btn-outline btn-sm" onClick={markAllRead}>Mark all read</button>}
          </div>
          {notifications.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>No notifications yet.</div>}
          {notifications.map((n) => (
            <Link key={n.id} to={n.session_id ? `/admin/interview-sessions/${n.session_id}` : '#'} className={`notif-item ${!n.is_read ? 'unread' : ''}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {(n.type === 'violation' || n.type === 'report_failed')
                  ? <AlertTriangle size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
                  : (n.type === 'focus_notice' || n.type === 'candidate_stop_request' || n.type === 'interview_exited')
                    ? <Info size={15} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
                    : <CheckCircle2 size={15} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />}
                <div>
                  <div>{n.message}</div>
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
