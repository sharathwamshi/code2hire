import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, AlertTriangle, CheckCircle2, Info, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
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
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState('all')
  const [actionPending, setActionPending] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = useCallback(() => Promise.all([
        client.get('/admin/notifications', { params: filter === 'unread' ? { unread: 1 } : {} }),
        client.get('/admin/notifications/unread-count'),
      ]).then(([listResponse, countResponse]) => {
        setNotifications(listResponse.data)
        setUnreadCount(countResponse.data.count)
        setError('')
      }).catch(() => {
        setError('Could not load notifications. Please try again.')
      }), [filter])

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markAllRead = async () => {
    setActionPending(true)
    setError('')
    try {
      await client.post('/admin/notifications/read-all')
      setNotifications((items) => filter === 'unread' ? [] : items.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
    } catch {
      setError('Could not mark notifications as read. Please try again.')
    } finally {
      setActionPending(false)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return
    setActionPending(true)
    setError('')
    try {
      await client.delete('/admin/notifications')
      setNotifications([])
      setUnreadCount(0)
    } catch {
      setError('Could not clear notifications. Please try again.')
    } finally {
      setActionPending(false)
    }
  }

  const openNotification = async (event, notification) => {
    if (notification.is_read) return
    event.preventDefault()
    setError('')
    try {
      await client.post(`/admin/notifications/${notification.id}/read`)
      setNotifications((items) => filter === 'unread'
        ? items.filter((item) => item.id !== notification.id)
        : items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
      setUnreadCount((count) => Math.max(0, count - 1))
      if (notification.session_id) navigate(`/admin/interview-sessions/${notification.session_id}`)
    } catch {
      setError('Could not mark this notification as read. Please try again.')
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="notif-bell" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={open}>
        <Bell size={20} color="var(--ink-soft)" />
        {unreadCount > 0 && <span className="notif-dot" />}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <div className="notif-heading">
              <strong>Notifications</strong>
              <span>{unreadCount} unread</span>
            </div>
            <div className="notif-actions">
              {unreadCount > 0 && <button className="notif-action" onClick={markAllRead} disabled={actionPending}>Mark all read</button>}
              <button className="notif-action notif-clear" onClick={clearAll} disabled={actionPending}>
                <Trash2 size={13} /> Clear all
              </button>
            </div>
          </div>
          <div className="notif-filters" aria-label="Filter notifications">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All</button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')} aria-pressed={filter === 'unread'}>Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
          </div>
          {error && <div className="notif-error" role="alert">{error}</div>}
          {notifications.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>No notifications yet.</div>}
          {notifications.map((n) => (
            <Link key={n.id} to={n.session_id ? `/admin/interview-sessions/${n.session_id}` : '#'} onClick={(event) => openNotification(event, n)} className={`notif-item ${!n.is_read ? 'unread' : ''}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
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
