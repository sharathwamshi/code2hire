import { Monitor } from 'lucide-react'

// Shown instead of the whole app when a desktop-only account signs in from a phone or tablet.
// Deliberately nothing else on screen: no menu, no links, no sign-in form.
export default function DesktopOnly() {
  return (
    <main role="alert" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '32px 28px', gap: 16, background: '#0A0720', color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <span style={{
        width: 76, height: 76, borderRadius: 22, display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, #7C5CFF, #FF5C8A 60%, #FFB547)', boxShadow: '0 14px 40px rgba(124,92,255,.45)',
      }}>
        <Monitor size={36} color="#fff" />
      </span>
      <h1 style={{ margin: 0, fontFamily: "'Sora', 'Inter', sans-serif", fontSize: 26, lineHeight: 1.25, letterSpacing: '-0.02em', color: '#fff' }}>
        Please log in from a computer
      </h1>
      <p style={{ margin: 0, maxWidth: 320, fontSize: 15.5, lineHeight: 1.6, color: '#CFC7F5' }}>
        This can&rsquo;t be used on a phone or tablet. Open it on a laptop or desktop to continue.
      </p>
    </main>
  )
}
