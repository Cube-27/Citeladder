import { useState } from 'react'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { VisibilityDashboard } from './screens/VisibilityDashboard'
import { SiteHealthDetail } from './screens/SiteHealthDetail'
import { DesignSystemSheet } from './screens/DesignSystemSheet'

type ScreenId = 'design-system' | 'onboarding' | 'dashboard-light' | 'dashboard-dark' | 'site-health'

const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'design-system', label: 'Design System' },
  { id: 'onboarding', label: '① Onboarding' },
  { id: 'dashboard-light', label: '② Dashboard' },
  { id: 'dashboard-dark', label: '② Dashboard (Dark)' },
  { id: 'site-health', label: '③ Site Health' },
]

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('onboarding')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-sans)' }}>
      {/* Screen switcher */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 10px',
        background: '#0D1228',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        height: 38,
      }}>
        {/* Logo mark */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          paddingRight: 14,
          borderRight: '1px solid rgba(255,255,255,0.08)',
          marginRight: 6,
          height: '100%',
        }}>
          <div style={{
            width: 20,
            height: 20,
            background: '#2756FF',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" />
              <line x1="8" y1="8" x2="13" y2="13" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
              <circle cx="5" cy="5" r="1.5" fill="white" />
            </svg>
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.50)',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
          }}>
            SEARCHIFY
          </span>
        </div>

        {SCREENS.map(s => (
          <button
            key={s.id}
            onClick={() => setScreen(s.id)}
            style={{
              padding: '0 10px',
              height: '100%',
              border: 'none',
              background: screen === s.id ? 'rgba(39,86,255,0.18)' : 'transparent',
              color: screen === s.id ? '#7DA0FF' : 'rgba(255,255,255,0.40)',
              fontSize: 12,
              fontWeight: screen === s.id ? 500 : 400,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              borderBottom: screen === s.id ? '2px solid #3F6AFF' : '2px solid transparent',
              transition: 'all 0.1s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseOver={e => {
              if (screen !== s.id) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'
            }}
            onMouseOut={e => {
              if (screen !== s.id) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)'
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Screen content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {screen === 'design-system' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DesignSystemSheet />
          </div>
        )}
        {screen === 'onboarding' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <OnboardingScreen />
          </div>
        )}
        {screen === 'dashboard-light' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <VisibilityDashboard dark={false} />
          </div>
        )}
        {screen === 'dashboard-dark' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <VisibilityDashboard dark={true} />
          </div>
        )}
        {screen === 'site-health' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <SiteHealthDetail />
          </div>
        )}
      </div>
    </div>
  )
}
