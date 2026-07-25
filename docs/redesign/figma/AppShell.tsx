import { type ReactNode } from 'react'

type NavId = 'setup' | 'prompts' | 'runs' | 'visibility' | 'health' | 'content' | 'analytics' | 'traffic' | 'providers' | 'settings'

interface AppShellProps {
  activeNav: NavId
  pageTitle: string
  dark?: boolean
  children: ReactNode
  headerContent?: ReactNode
}

function NavIcon({ name }: { name: NavId }) {
  const icons: Record<NavId, ReactNode> = {
    setup: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
    prompts: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
    runs: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
      </svg>
    ),
    visibility: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    health: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
      </svg>
    ),
    content: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
    analytics: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    traffic: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
        <polyline points="16,7 22,7 22,13" />
      </svg>
    ),
    providers: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" />
        <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    settings: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="14" cy="6" r="2" fill="var(--surface-panel)" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="8" cy="12" r="2" fill="var(--surface-panel)" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="16" cy="18" r="2" fill="var(--surface-panel)" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    ),
  }
  return <>{icons[name]}</>
}

const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'runs', label: 'Runs' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'health', label: 'Site Health' },
  { id: 'content', label: 'Content' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'providers', label: 'Providers' },
  { id: 'settings', label: 'Settings' },
]

export function AppShell({ activeNav, pageTitle, dark, children, headerContent }: AppShellProps) {
  const bg = dark ? '#09090F' : 'var(--surface-page)'
  const panelBg = dark ? '#0F1118' : 'var(--surface-panel)'
  const sidebarBorder = dark ? '#1F2638' : 'var(--border-default)'
  const textPrimary = dark ? '#ECEEF5' : 'var(--text-primary)'
  const textSecondary = dark ? '#868FB0' : 'var(--text-secondary)'
  const activeBg = dark ? 'rgba(63,106,255,0.14)' : 'var(--blue-50)'
  const activeText = dark ? '#7DA0FF' : 'var(--blue-600)'
  const topBorder = dark ? '#1F2638' : 'var(--border-default)'

  return (
    <div style={{ display: 'flex', height: '100%', background: bg, color: textPrimary }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: panelBg,
        borderRight: `1px solid ${sidebarBorder}`,
        height: '100%',
      }}>
        {/* Logo */}
        <div style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderBottom: `1px solid ${sidebarBorder}`,
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{
            width: 28,
            height: 28,
            background: 'var(--accent)',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" />
              <line x1="8" y1="8" x2="13" y2="13" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
              <circle cx="5" cy="5" r="1.5" fill="white" />
            </svg>
          </div>
          <span style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: '-0.01em',
            color: textPrimary,
          }}>
            Searchify
          </span>
        </div>

        {/* Project switcher */}
        <div style={{
          padding: '12px 12px 8px',
          borderBottom: `1px solid ${sidebarBorder}`,
          flexShrink: 0,
        }}>
          <button style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 7,
            border: `1px solid ${sidebarBorder}`,
            background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-page)',
            cursor: 'pointer',
            color: textPrimary,
          }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: '#4A72FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: 'white',
              flexShrink: 0,
            }}>A</div>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Acme Corporation
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.id === activeNav
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 10px',
                  height: 36,
                  borderRadius: 7,
                  cursor: 'pointer',
                  background: isActive ? activeBg : 'transparent',
                  color: isActive ? activeText : textSecondary,
                  fontWeight: isActive ? 500 : 400,
                  fontSize: 13.5,
                  marginBottom: 1,
                  position: 'relative',
                  userSelect: 'none',
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: '0 2px 2px 0',
                    background: 'var(--accent)',
                  }} />
                )}
                <span style={{ opacity: isActive ? 1 : 0.65 }}>
                  <NavIcon name={item.id} />
                </span>
                <span>{item.label}</span>
                {item.id === 'runs' && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    fontWeight: 500,
                    background: 'var(--run-running-bg)',
                    color: 'var(--run-running-text)',
                    padding: '1px 6px',
                    borderRadius: 99,
                  }}>3</span>
                )}
              </div>
            )
          })}
        </nav>

        {/* User */}
        <div style={{
          padding: '10px 12px',
          borderTop: `1px solid ${sidebarBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 99,
            background: 'linear-gradient(135deg, #4A72FF, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            color: 'white',
            flexShrink: 0,
          }}>JS</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Jamie Sutton
            </div>
            <div style={{ fontSize: 11, color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              jamie@acmecorp.com
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{
          height: 52,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          background: panelBg,
          borderBottom: `1px solid ${topBorder}`,
          gap: 16,
        }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: textPrimary, flex: 1 }}>
            {pageTitle}
          </h1>
          {headerContent}
          {/* Theme indicator badge */}
          {dark && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: '#868FB0',
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #1F2638',
              background: 'rgba(255,255,255,0.03)',
              letterSpacing: '0.04em',
            }}>
              <span style={{ fontSize: 10 }}>●</span>
              DARK MODE
            </div>
          )}
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
