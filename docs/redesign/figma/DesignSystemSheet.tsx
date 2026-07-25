import { ScoreRing } from '../components/ScoreRing'
import { Sparkline } from '../components/Sparkline'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 52 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border-default)',
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function TokenRow({ name, value, swatch }: { name: string; value: string; swatch?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      borderRadius: 7,
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-subtle)',
      marginBottom: 4,
    }}>
      {swatch && (
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: swatch,
          border: '1px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }} />
      )}
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--accent-text)', flex: 1 }}>
        {name}
      </code>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>
        {value}
      </span>
    </div>
  )
}

function ColorRamp({ name, shades }: {
  name: string
  shades: { shade: string | number; hex: string; token: string }[]
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.04em' }}>
        {name}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {shades.map(s => (
          <div key={s.shade} style={{ flex: 1 }}>
            <div style={{
              height: 36,
              borderRadius: 6,
              background: s.hex,
              border: '1px solid rgba(0,0,0,0.06)',
              marginBottom: 4,
            }} />
            <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {s.shade}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TypeScale({ size, weight, label, sample }: { size: number; weight: number; label: string; sample?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 16,
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ width: 140, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {size}px / {weight}
        </div>
      </div>
      <div style={{ fontSize: size, fontWeight: weight, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}>
        {sample ?? 'Acme Corporation AI Visibility Platform'}
      </div>
    </div>
  )
}

function Badge({ label, style: st }: { label: string; style: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 9px',
      borderRadius: 99,
      fontSize: 11.5,
      fontWeight: 500,
      ...st,
    }}>
      {label}
    </span>
  )
}

function ElevationCard({ level, shadow, desc }: { level: number; shadow: string; desc: string }) {
  return (
    <div style={{
      padding: '20px 20px',
      borderRadius: 10,
      background: 'var(--surface-panel)',
      boxShadow: shadow,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--accent-text)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Level {level}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{desc}</div>
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4, wordBreak: 'break-all' }}>
        {shadow}
      </code>
    </div>
  )
}

function Btn({
  variant, label, disabled,
}: { variant: 'primary' | 'secondary' | 'ghost' | 'danger'; label: string; disabled?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--accent)',
      color: 'white',
      border: 'none',
      boxShadow: '0 1px 3px rgba(39,86,255,0.28)',
    },
    secondary: {
      background: 'var(--surface-panel)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-default)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: 'none',
    },
    danger: {
      background: 'var(--danger-bg)',
      color: 'var(--danger-text)',
      border: '1px solid var(--danger-border)',
    },
  }
  return (
    <button style={{
      padding: '8px 16px',
      borderRadius: 7,
      fontSize: 13.5,
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'var(--font-sans)',
      opacity: disabled ? 0.45 : 1,
      ...styles[variant],
    }} disabled={disabled}>
      {label}
    </button>
  )
}

export function DesignSystemSheet() {
  const BLUE = [
    { shade: 50, hex: '#EBF0FF', token: '--blue-50' },
    { shade: 100, hex: '#D5E2FF', token: '--blue-100' },
    { shade: 200, hex: '#ACC4FF', token: '--blue-200' },
    { shade: 300, hex: '#7A9FFF', token: '--blue-300' },
    { shade: 400, hex: '#4972FF', token: '--blue-400' },
    { shade: 500, hex: '#2756FF', token: '--blue-500' },
    { shade: 600, hex: '#1A44EB', token: '--blue-600' },
    { shade: 700, hex: '#1235CC', token: '--blue-700' },
    { shade: 800, hex: '#0D28A0', token: '--blue-800' },
    { shade: 900, hex: '#091E78', token: '--blue-900' },
  ]

  const NEUTRAL = [
    { shade: 50, hex: '#F7F8FA', token: '--neutral-50' },
    { shade: 100, hex: '#EFF1F6', token: '--neutral-100' },
    { shade: 200, hex: '#E2E5EE', token: '--neutral-200' },
    { shade: 300, hex: '#C8CEDE', token: '--neutral-300' },
    { shade: 400, hex: '#98A2BE', token: '--neutral-400' },
    { shade: 500, hex: '#667092', token: '--neutral-500' },
    { shade: 600, hex: '#454E6E', token: '--neutral-600' },
    { shade: 700, hex: '#2C3454', token: '--neutral-700' },
    { shade: 800, hex: '#1A2040', token: '--neutral-800' },
    { shade: 900, hex: '#0D1228', token: '--neutral-900' },
  ]

  return (
    <div style={{
      background: 'var(--surface-page)',
      minHeight: '100%',
      padding: '40px 48px',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'var(--accent)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" />
                <line x1="8" y1="8" x2="13" y2="13" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
                <circle cx="5" cy="5" r="1.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Searchify · Design System
            </span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 10 }}>
            Design System
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 600 }}>
            Tokens, components, and patterns for Searchify — the AI visibility and site intelligence platform.
            Built for density, clarity, and precision analytics work.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {[
              { label: 'Inter', desc: 'Primary UI font' },
              { label: 'Geist Mono', desc: 'Numeric + data' },
              { label: '#2756FF', desc: 'Accent blue' },
              { label: '4px grid', desc: 'Spacing base' },
            ].map(tag => (
              <span key={tag.label} style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 14px',
                background: 'var(--surface-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{tag.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{tag.desc}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Color Ramps */}
        <Section title="Color Ramps">
          <ColorRamp name="Blue (accent)" shades={BLUE} />
          <ColorRamp name="Neutral (base)" shades={NEUTRAL} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>Surface tokens</div>
              {[
                { name: '--surface-page', value: '#F7F8FA', hex: '#F7F8FA' },
                { name: '--surface-panel', value: '#FFFFFF', hex: '#FFFFFF' },
                { name: '--surface-elevated', value: '#FFFFFF + shadow-3', hex: '#FFFFFF' },
                { name: '--surface-sunken', value: '#EFF1F6', hex: '#EFF1F6' },
              ].map(t => <TokenRow key={t.name} name={t.name} value={t.value} swatch={t.hex} />)}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>Text tokens</div>
              {[
                { name: '--text-primary', value: '#0D1228', hex: '#0D1228' },
                { name: '--text-secondary', value: '#454E6E', hex: '#454E6E' },
                { name: '--text-tertiary', value: '#98A2BE', hex: '#98A2BE' },
                { name: '--text-disabled', value: '#C8CEDE', hex: '#C8CEDE' },
                { name: '--text-accent', value: '#1A44EB', hex: '#1A44EB' },
                { name: '--text-inverse', value: '#FFFFFF', hex: '#FFFFFF' },
              ].map(t => <TokenRow key={t.name} name={t.name} value={t.value} swatch={t.hex} />)}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>Accent tokens</div>
              {[
                { name: '--accent', value: '#2756FF', hex: '#2756FF' },
                { name: '--accent-hover', value: '#1A44EB', hex: '#1A44EB' },
                { name: '--accent-subtle', value: '#EBF0FF', hex: '#EBF0FF' },
                { name: '--accent-border', value: '#ACC4FF', hex: '#ACC4FF' },
                { name: '--border-default', value: '#E2E5EE', hex: '#E2E5EE' },
                { name: '--border-subtle', value: '#EFF1F6', hex: '#EFF1F6' },
              ].map(t => <TokenRow key={t.name} name={t.name} value={t.value} swatch={t.hex} />)}
            </div>
          </div>
        </Section>

        {/* Status colors */}
        <Section title="Status & Semantic Colors">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { name: 'success', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', label: 'Success' },
              { name: 'warning', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', label: 'Warning' },
              { name: 'danger', bg: '#FFF1F1', border: '#FECACA', text: '#B91C1C', label: 'Danger' },
              { name: 'info', bg: '#EBF0FF', border: '#ADC4FF', text: '#1A44EB', label: 'Info' },
              { name: 'neutral', bg: '#F7F8FA', border: '#E2E5EE', text: '#454E6E', label: 'Neutral' },
            ].map(s => (
              <div key={s.name} style={{
                padding: '16px',
                background: s.bg,
                border: `1.5px solid ${s.border}`,
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.text, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: s.text, opacity: 0.7 }}>--{s.name}-bg</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: s.text, opacity: 0.7 }}>--{s.name}-border</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: s.text, opacity: 0.7 }}>--{s.name}-text</div>
              </div>
            ))}
          </div>

          {/* Score bands */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>Score bands (0–100)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Low', range: '0–29', bg: '#FFF1F1', border: '#FECACA', text: '#B91C1C', ring: '#EF4444', token: 'score-low' },
              { label: 'Mid', range: '30–59', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', ring: '#F59E0B', token: 'score-mid' },
              { label: 'Good', range: '60–79', bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', ring: '#10B981', token: 'score-good' },
              { label: 'High', range: '80–100', bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D', ring: '#22C55E', token: 'score-high' },
            ].map(s => (
              <div key={s.label} style={{ padding: '16px', background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: s.ring, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: s.text, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>{s.range}</div>
                  <div style={{ fontSize: 10, color: s.text, opacity: 0.5, fontFamily: 'var(--font-mono)', marginTop: 2 }}>--{s.token}-*</div>
                </div>
              </div>
            ))}
          </div>

          {/* Run states */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>Run states</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Draft', bg: '#F7F8FA', text: '#667092', border: '#E2E5EE' },
              { label: 'Queued', bg: '#F7F8FA', text: '#454E6E', border: '#E2E5EE' },
              { label: 'Running', bg: '#EBF0FF', text: '#1A44EB', border: '#ADC4FF' },
              { label: 'Analyzing', bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
              { label: 'Completed', bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
              { label: 'Partial', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
              { label: 'Failed', bg: '#FFF1F1', text: '#B91C1C', border: '#FECACA' },
              { label: 'Cancelled', bg: '#F7F8FA', text: '#98A2BE', border: '#E2E5EE' },
            ].map(s => (
              <Badge key={s.label} label={s.label} style={{
                background: s.bg,
                color: s.text,
                border: `1px solid ${s.border}`,
              }} />
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography Scale">
          <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            <TypeScale label="Hero metric" size={48} weight={600} sample="62.4%" />
            <TypeScale label="Page title" size={26} weight={600} sample="AI Visibility Dashboard" />
            <TypeScale label="Section title" size={17} weight={600} sample="Competitors" />
            <TypeScale label="Card title" size={15} weight={600} sample="Share of Voice by Model" />
            <TypeScale label="Body / Primary" size={14} weight={400} />
            <TypeScale label="Body / Medium" size={14} weight={500} />
            <TypeScale label="Table cell" size={14} weight={400} sample="acmecorp.com" />
            <TypeScale label="Secondary" size={13} weight={400} sample="2 hours ago · Run #47 · 124 prompts" />
            <TypeScale label="Caption" size={12} weight={400} sample="Last crawled Apr 18, 2025 at 14:32 UTC" />
            <TypeScale label="Micro label" size={11} weight={500} sample="VISIBILITY SCORE · TABLE HEADER" />
          </div>
          <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Monospace — Geist Mono — numeric & data contexts
            </div>
            <TypeScale label="Hero numeric" size={48} weight={600} sample="62.4%" />
            <TypeScale label="Large data" size={22} weight={600} sample="247 mentions · 189 citations" />
            <TypeScale label="Data cell" size={13} weight={400} sample="https://acmecorp.com/products/" />
            <TypeScale label="Micro mono" size={11} weight={500} sample="RUN #47 · APR-18-2025 · 14:32 UTC" />
          </div>
        </Section>

        {/* Spacing + Radius */}
        <Section title="Spacing & Radius">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>Spacing scale (4px base)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[4, 8, 12, 16, 20, 24, 32, 40, 48, 64].map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 28 }}>{n}</span>
                    <div style={{ height: 8, width: n * 1.5, background: 'var(--accent)', borderRadius: 2, opacity: 0.7 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{n}px</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>Radius scale</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { token: '--r-xs', value: '4px', size: 4 },
                  { token: '--r-sm', value: '6px', size: 6 },
                  { token: '--r-md', value: '8px', size: 8 },
                  { token: '--r-lg', value: '12px', size: 12 },
                  { token: '--r-xl', value: '16px', size: 16 },
                  { token: '--r-full', value: '9999px', size: 9999 },
                ].map(r => (
                  <div key={r.token} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-text)', width: 80 }}>{r.token}</code>
                    <div style={{
                      width: 48,
                      height: 48,
                      border: '2px solid var(--accent)',
                      borderRadius: Math.min(r.size, 24),
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.value}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {r.token === '--r-xs' ? 'Badges, tags' : r.token === '--r-sm' ? 'Buttons, inputs' : r.token === '--r-md' ? 'Cards (default)' : r.token === '--r-lg' ? 'Panels, modals' : r.token === '--r-xl' ? 'Large cards' : 'Chips, pills'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Elevation */}
        <Section title="Elevation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <ElevationCard
              level={1}
              shadow="0 1px 2px rgba(13,18,40,0.05), 0 0 0 1px rgba(13,18,40,0.05)"
              desc="Page panels, table"
            />
            <ElevationCard
              level={2}
              shadow="0 2px 6px rgba(13,18,40,0.07), 0 0 0 1px rgba(13,18,40,0.06)"
              desc="Cards, score tiles"
            />
            <ElevationCard
              level={3}
              shadow="0 6px 20px rgba(13,18,40,0.10), 0 1px 4px rgba(13,18,40,0.05), 0 0 0 1px rgba(13,18,40,0.07)"
              desc="Popovers, dropdowns"
            />
            <ElevationCard
              level={4}
              shadow="0 16px 40px rgba(13,18,40,0.14), 0 4px 10px rgba(13,18,40,0.07), 0 0 0 1px rgba(13,18,40,0.09)"
              desc="Modals, dialogs"
            />
          </div>
        </Section>

        {/* Components: Buttons */}
        <Section title="Buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>Variants</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn variant="primary" label="Primary action" />
                <Btn variant="secondary" label="Secondary" />
                <Btn variant="ghost" label="Ghost" />
                <Btn variant="danger" label="Delete item" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>Disabled state</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn variant="primary" label="Primary action" disabled />
                <Btn variant="secondary" label="Secondary" disabled />
                <Btn variant="ghost" label="Ghost" disabled />
                <Btn variant="danger" label="Delete item" disabled />
              </div>
            </div>
          </div>
        </Section>

        {/* Score rings */}
        <Section title="Score Rings">
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {[18, 45, 72, 91].map(s => (
              <ScoreRing key={s} score={s} size={100} strokeWidth={9} />
            ))}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              {[120, 160].map(sz => (
                <ScoreRing key={sz} score={62} size={sz} strokeWidth={sz === 160 ? 14 : 11} label="AEO" showLabel />
              ))}
            </div>
          </div>
        </Section>

        {/* Sparklines */}
        <Section title="Sparklines">
          <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { data: [40, 45, 43, 50, 52, 55, 62], label: 'Rising trend' },
              { data: [60, 55, 52, 50, 48, 45, 43], label: 'Declining trend' },
              { data: [42, 44, 41, 43, 42, 44, 43], label: 'Flat / stable' },
              { data: [30, 55, 38, 62, 45, 58, 52], label: 'Volatile' },
            ].map(({ data, label }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Sparkline data={data} width={100} height={36} />
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Table example */}
        <Section title="Table Anatomy">
          <div style={{
            background: 'var(--surface-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-1)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['#', 'Brand', 'Visibility', 'Mentions', 'Status', 'Trend'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 16px',
                      textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: 1, name: 'Acme Corp', you: true, vis: 62.4, mentions: 247, status: 'Completed', data: [55,58,60,62] },
                  { rank: 2, name: 'TechCo', you: false, vis: 48.7, mentions: 183, status: 'Completed', data: [52,49,48,48] },
                  { rank: 3, name: 'DataFlow', you: false, vis: 45.2, mentions: 169, status: 'Running', data: [41,43,44,45] },
                ].map(row => (
                  <tr key={row.rank} style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: row.you ? 'var(--blue-50)' : 'transparent',
                  }}>
                    <td style={{ padding: '14px 16px', textAlign: 'center', width: 40 }}>
                      <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontWeight: 500 }}>{row.rank}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: row.you ? 'var(--blue-100)' : 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: row.you ? 'var(--blue-700)' : 'var(--text-tertiary)' }}>
                          {row.name[0]}
                        </div>
                        <span style={{ fontSize: 13.5, fontWeight: row.you ? 600 : 400, color: 'var(--text-primary)' }}>{row.name}</span>
                        {row.you && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--blue-100)', color: 'var(--blue-700)' }}>YOU</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: row.you ? '#10B981' : 'var(--text-primary)' }}>{row.vis}%</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{row.mentions}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <Badge label={row.status} style={{
                        background: row.status === 'Running' ? 'var(--run-running-bg)' : 'var(--run-completed-bg)',
                        color: row.status === 'Running' ? 'var(--run-running-text)' : 'var(--run-completed-text)',
                        border: `1px solid ${row.status === 'Running' ? 'var(--info-border)' : 'var(--success-border)'}`,
                      }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Sparkline data={row.data} width={64} height={24} />
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Skeleton rows */}
                {[1, 2].map(i => (
                  <tr key={`skel-${i}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {[32, 140, 60, 60, 80, 80].map((w, j) => (
                      <td key={j} style={{ padding: '14px 16px' }}>
                        <div style={{ height: 12, width: w, background: 'var(--border-default)', borderRadius: 4, margin: '0 auto', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Row height: 48px minimum · Active row: accent-subtle background · Skeleton: border-default + pulse animation
          </div>
        </Section>

        {/* Chart palette */}
        <Section title="Chart Palette">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { n: 1, hex: '#2756FF', label: 'Chart 1' },
              { n: 2, hex: '#10B981', label: 'Chart 2' },
              { n: 3, hex: '#F59E0B', label: 'Chart 3' },
              { n: 4, hex: '#EF4444', label: 'Chart 4' },
              { n: 5, hex: '#8B5CF6', label: 'Chart 5' },
              { n: 6, hex: '#06B6D4', label: 'Chart 6' },
              { n: 7, hex: '#F97316', label: 'Chart 7' },
              { n: 8, hex: '#EC4899', label: 'Chart 8' },
            ].map(c => (
              <div key={c.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 10,
                  background: c.hex,
                  border: '1px solid rgba(0,0,0,0.08)',
                }} />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>--chart-{c.n}</span>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{c.hex}</span>
              </div>
            ))}
          </div>
        </Section>

        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    </div>
  )
}
