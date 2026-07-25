import { useState } from 'react'

type Step = 1 | 4 | 5
const STEPS = [
  { n: 1, label: 'Brand Profile' },
  { n: 2, label: 'Market' },
  { n: 3, label: 'Owned Domains' },
  { n: 4, label: 'Competitors' },
  { n: 5, label: 'Audit Defaults' },
]

interface Competitor {
  name: string
  domain: string
}

const SUGGESTED_COMPETITORS: Competitor[] = [
  { name: 'TechCo', domain: 'techco.io' },
  { name: 'DataFlow Inc', domain: 'dataflow.com' },
  { name: 'Nexus AI', domain: 'nexusai.com' },
]

const INDUSTRIES = [
  'B2B SaaS', 'B2C Technology', 'E-commerce', 'Financial Services', 'Healthcare',
  'Marketing & Advertising', 'Media & Publishing', 'Professional Services', 'Retail', 'Other',
]

function Input({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '9px 12px',
          borderRadius: 7,
          border: '1px solid var(--border-default)',
          background: 'var(--surface-panel)',
          fontSize: 14,
          color: 'var(--text-primary)',
          outline: 'none',
          width: '100%',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{hint}</span>}
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '9px 12px',
          borderRadius: 7,
          border: '1px solid var(--border-default)',
          background: 'var(--surface-panel)',
          fontSize: 14,
          color: 'var(--text-primary)',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2398A2BE' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 36,
        }}
      >
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function StepBrand({ brandName, setBrandName, domain, setDomain, description, setDescription, industry, setIndustry }: {
  brandName: string; setBrandName: (v: string) => void
  domain: string; setDomain: (v: string) => void
  description: string; setDescription: (v: string) => void
  industry: string; setIndustry: (v: string) => void
}) {
  const [generating, setGenerating] = useState(false)

  const handleGenerate = () => {
    setGenerating(true)
    setTimeout(() => {
      setDescription(`${brandName || 'This brand'} is an enterprise-grade data analytics and business intelligence platform that helps marketing and growth teams measure their digital presence, track AI visibility, and optimize content for answer engine discovery.`)
      setGenerating(false)
    }, 1200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Input label="Brand name" value={brandName} onChange={setBrandName} placeholder="Acme Corporation" />
        <Input label="Brand website" value={domain} onChange={setDomain} placeholder="acmecorp.com" type="url"
          hint="Primary domain used to identify owned citations" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Brand description</label>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--accent-border)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent-text)',
              fontSize: 12,
              fontWeight: 500,
              cursor: generating ? 'default' : 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
                </svg>
                Generate with AI
              </>
            )}
          </button>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe your brand — what you do, who you serve, and what makes you distinctive…"
          rows={3}
          style={{
            padding: '9px 12px',
            borderRadius: 7,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-panel)',
            fontSize: 14,
            color: 'var(--text-primary)',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
        />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          AI models use this to learn what your brand does. Be specific — generalities get poor results.
        </span>
      </div>
      <Select label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StepCompetitors({ competitors, setCompetitors }: {
  competitors: Competitor[]; setCompetitors: (v: Competitor[]) => void
}) {
  const [suggesting, setSuggesting] = useState(false)
  const [suggested, setSuggested] = useState(false)

  const handleSuggest = () => {
    setSuggesting(true)
    setTimeout(() => {
      setCompetitors(SUGGESTED_COMPETITORS)
      setSuggesting(false)
      setSuggested(true)
    }, 1000)
  }

  const updateRow = (i: number, field: keyof Competitor, val: string) => {
    const next = [...competitors]
    next[i] = { ...next[i], [field]: val }
    setCompetitors(next)
  }

  const removeRow = (i: number) => {
    setCompetitors(competitors.filter((_, idx) => idx !== i))
  }

  const addRow = () => {
    setCompetitors([...competitors, { name: '', domain: '' }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Add the brands you compete with in AI answers. Searchify tracks how often they appear versus you.
        </p>
        <button
          onClick={handleSuggest}
          disabled={suggesting}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '7px 12px',
            borderRadius: 7,
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-subtle)',
            color: 'var(--accent-text)',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: suggesting ? 'default' : 'pointer',
            opacity: suggesting ? 0.7 : 1,
            marginLeft: 16,
            whiteSpace: 'nowrap',
          }}
        >
          {suggesting ? 'Analyzing…' : suggested ? '✓ AI Suggested' : '✦ Suggest with AI'}
        </button>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: 2 }}>
          Competitor name
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: 2 }}>
          Domain
        </span>
        <span />
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {competitors.length === 0 ? (
          <div style={{
            padding: '32px 24px',
            border: '1.5px dashed var(--border-default)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M2 20c0-4.42 4.48-8 10-8s10 3.58 10 8" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No competitors added yet — use AI to suggest some, or add manually.
            </p>
          </div>
        ) : (
          competitors.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8, alignItems: 'center' }}>
              <input
                value={c.name}
                onChange={e => updateRow(i, 'name', e.target.value)}
                placeholder="Competitor name"
                style={{
                  padding: '9px 12px',
                  borderRadius: 7,
                  border: '1px solid var(--border-default)',
                  background: 'var(--surface-panel)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-sans)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
              />
              <input
                value={c.domain}
                onChange={e => updateRow(i, 'domain', e.target.value)}
                placeholder="competitor.com"
                style={{
                  padding: '9px 12px',
                  borderRadius: 7,
                  border: '1px solid var(--border-default)',
                  background: 'var(--surface-panel)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
              />
              <button
                onClick={() => removeRow(i)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 7,
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--danger-bg)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={addRow}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 7,
          border: '1px dashed var(--border-default)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: 13.5,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          width: 'fit-content',
        }}
        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add competitor
      </button>
    </div>
  )
}

const ENGINE_INFO = [
  { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', bg: '#F0FDF4', label: 'GPT-4o' },
  { id: 'claude', name: 'Claude', color: '#D97757', bg: '#FFF7ED', label: 'Claude 3.5' },
  { id: 'gemini', name: 'Gemini', color: '#4285F4', bg: '#EBF0FF', label: 'Gemini 1.5' },
]

const FREQUENCIES = [
  { id: 'manual', label: 'Manual' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

function StepDefaults({ engines, setEngines, frequency, setFrequency, brandName, domain, competitors }: {
  engines: string[]; setEngines: (v: string[]) => void
  frequency: string; setFrequency: (v: string) => void
  brandName: string; domain: string; competitors: Competitor[]
}) {
  const toggleEngine = (id: string) => {
    if (engines.includes(id)) {
      setEngines(engines.filter(e => e !== id))
    } else {
      setEngines([...engines, id])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Engine selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>AI engines to audit</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {ENGINE_INFO.map(eng => {
            const active = engines.includes(eng.id)
            return (
              <button
                key={eng.id}
                onClick={() => toggleEngine(eng.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 9,
                  border: active ? `2px solid ${eng.color}` : '1.5px solid var(--border-default)',
                  background: active ? eng.bg : 'var(--surface-panel)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: eng.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'white',
                  flexShrink: 0,
                }}>
                  {eng.name[0]}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{eng.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{eng.label}</div>
                </div>
                {active && (
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 16,
                    height: 16,
                    borderRadius: 99,
                    background: eng.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Frequency */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Audit frequency</label>
        <div style={{
          display: 'flex',
          background: 'var(--surface-sunken)',
          borderRadius: 9,
          padding: 3,
          gap: 2,
          border: '1px solid var(--border-default)',
          width: 'fit-content',
        }}>
          {FREQUENCIES.map(f => (
            <button
              key={f.id}
              onClick={() => setFrequency(f.id)}
              style={{
                padding: '7px 20px',
                borderRadius: 7,
                border: 'none',
                background: frequency === f.id ? 'var(--surface-panel)' : 'transparent',
                boxShadow: frequency === f.id ? 'var(--shadow-1)' : 'none',
                color: frequency === f.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: frequency === f.id ? 500 : 400,
                fontSize: 13.5,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.12s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Project summary
        </div>
        {[
          { label: 'Brand', value: brandName || '—' },
          { label: 'Domain', value: domain || '—', mono: true },
          { label: 'Competitors', value: competitors.length > 0 ? competitors.map(c => c.name).join(', ') : 'None added' },
          { label: 'Engines', value: engines.length > 0 ? engines.map(id => ENGINE_INFO.find(e => e.id === id)?.name).join(', ') : 'None selected' },
          { label: 'Frequency', value: FREQUENCIES.find(f => f.id === frequency)?.label ?? '—' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', width: 90, flexShrink: 0 }}>{row.label}</span>
            <span style={{ fontSize: 13.5, color: 'var(--text-primary)', fontFamily: row.mono ? 'var(--font-mono)' : undefined, fontWeight: 500 }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RightPanel({ step, brandName, domain, competitors }: {
  step: Step; brandName: string; domain: string; competitors: Competitor[]
}) {
  const bg = 'linear-gradient(160deg, #0D1A3D 0%, #0F1228 60%, #12172E 100%)'

  return (
    <div style={{
      flex: '0 0 420px',
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 40px',
      gap: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle grid pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(circle at center, rgba(39,86,255,0.06) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: -100,
        right: -80,
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(39,86,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 99,
          border: '1px solid rgba(39,86,255,0.3)',
          background: 'rgba(39,86,255,0.1)',
          marginBottom: 20,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: '#4D7BFF' }} />
          <span style={{ fontSize: 11.5, fontWeight: 500, color: '#7DA0FF', letterSpacing: '0.04em' }}>
            {step === 1 ? 'BRAND SETUP' : step === 4 ? 'COMPETITOR TRACKING' : 'AUDIT CONFIGURATION'}
          </span>
        </div>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: '#ECEEF5', lineHeight: 1.3, marginBottom: 10, letterSpacing: '-0.02em' }}>
                Your brand's AI presence starts here
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', lineHeight: 1.65 }}>
                Searchify measures how often your brand appears in answers from ChatGPT, Claude, and Gemini — and how you compare to competitors.
              </p>
            </div>

            {/* Preview card */}
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>
                Brand profile preview
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Name', value: brandName || 'Your brand name' },
                  { label: 'Domain', value: domain || 'yourdomain.com', mono: true },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', width: 58, flexShrink: 0 }}>{r.label}</span>
                    <span style={{
                      fontSize: 14,
                      color: brandName || domain ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
                      fontFamily: r.mono ? 'var(--font-mono)' : undefined,
                      fontWeight: 500,
                    }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Visibility Score', value: '—', hint: 'After first audit' },
                { label: 'Share of Voice', value: '—', hint: 'vs competitors' },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.40)' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{s.hint}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: '#ECEEF5', lineHeight: 1.3, marginBottom: 10, letterSpacing: '-0.02em' }}>
                Track every brand in the conversation
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', lineHeight: 1.65 }}>
                When AI models answer questions in your space, who gets mentioned? Competitors shows you exactly who you're up against in the AI answer layer.
              </p>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                Visibility ranking (preview)
              </div>
              {[
                { name: brandName || 'Your brand', score: 62, you: true },
                ...competitors.slice(0, 3).map((c, i) => ({
                  name: c.name || `Competitor ${i + 1}`,
                  score: [48, 45, 39][i],
                  you: false,
                })),
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: row.you ? 'rgba(39,86,255,0.14)' : 'transparent',
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'var(--font-mono)', width: 14, textAlign: 'right' }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 13.5, color: row.you ? '#7DA0FF' : 'rgba(255,255,255,0.65)', fontWeight: row.you ? 500 : 400 }}>
                    {row.name}
                  </span>
                  {row.you && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#4D7BFF', background: 'rgba(39,86,255,0.2)', padding: '1px 6px', borderRadius: 99 }}>
                      YOU
                    </span>
                  )}
                  <div style={{ width: 80, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ height: '100%', width: `${row.score}%`, borderRadius: 99, background: row.you ? '#4D7BFF' : 'rgba(255,255,255,0.25)' }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: row.you ? '#7DA0FF' : 'rgba(255,255,255,0.45)', width: 36, textAlign: 'right' }}>
                    {row.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: '#ECEEF5', lineHeight: 1.3, marginBottom: 10, letterSpacing: '-0.02em' }}>
                You're almost ready
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', lineHeight: 1.65 }}>
                Once created, Searchify will run its first audit automatically. Results appear in the Visibility Dashboard within a few minutes.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🔍', title: 'Prompt library', desc: 'We build an initial set of search prompts based on your brand and industry' },
                { icon: '🤖', title: 'Multi-engine audit', desc: 'Queries run simultaneously across ChatGPT, Claude, and Gemini' },
                { icon: '📊', title: 'Visibility scoring', desc: 'Results are scored, ranked, and compared against your competitors' },
              ].map(item => (
                <div key={item.title} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.3 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.80)', marginBottom: 3 }}>{item.title}</div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.40)', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const STEP_ORDER: Step[] = [1, 4, 5]

export function OnboardingScreen() {
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEP_ORDER[stepIdx]

  // Step 1 state
  const [brandName, setBrandName] = useState('Acme Corporation')
  const [domain, setDomain] = useState('acmecorp.com')
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('B2B SaaS')

  // Step 4 state
  const [competitors, setCompetitors] = useState<Competitor[]>(SUGGESTED_COMPETITORS)

  // Step 5 state
  const [engines, setEngines] = useState(['chatgpt', 'claude', 'gemini'])
  const [frequency, setFrequency] = useState('weekly')

  const canGoBack = stepIdx > 0
  const isLast = stepIdx === STEP_ORDER.length - 1

  const fullStepMap: Record<Step, number> = { 1: 0, 4: 3, 5: 4 }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: 'var(--surface-page)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 48px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26,
              height: 26,
              background: 'var(--accent)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" />
                <line x1="8" y1="8" x2="13" y2="13" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
                <circle cx="5" cy="5" r="1.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              Searchify
            </span>
          </div>
          <button style={{
            fontSize: 13,
            color: 'var(--text-tertiary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>
            Sign out
          </button>
        </div>

        {/* Progress indicator */}
        <div style={{ padding: '28px 48px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 6 }}>
            {STEPS.map((s, i) => {
              const current = fullStepMap[step]
              const isActive = i === current
              const isDone = i < current
              return (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1' : undefined }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 99,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      background: isActive ? 'var(--accent)' : isDone ? 'var(--success-bg)' : 'var(--surface-panel)',
                      color: isActive ? 'white' : isDone ? 'var(--success-text)' : 'var(--text-tertiary)',
                      border: isActive ? '2px solid var(--accent)' : isDone ? '2px solid var(--success-border)' : '1.5px solid var(--border-default)',
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}>
                      {isDone ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : s.n}
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{
                      flex: 1,
                      height: 1.5,
                      background: isDone ? 'var(--success-text)' : 'var(--border-default)',
                      opacity: isDone ? 0.5 : 1,
                      margin: '0 6px',
                      marginBottom: 5,
                      transition: 'all 0.2s ease',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
            {STEPS.map((s) => (
              <span key={s.n} style={{
                fontSize: 11,
                fontWeight: 500,
                color: fullStepMap[step] === STEPS.findIndex(x => x.n === s.n) ? 'var(--accent-text)' : 'var(--text-tertiary)',
                letterSpacing: '0.02em',
                textAlign: 'center',
                width: 80,
                marginLeft: -16,
              }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Form content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '32px 48px',
          overflow: 'auto',
        }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 6 }}>
                {step === 1 && 'Tell us about your brand'}
                {step === 4 && 'Who are your competitors?'}
                {step === 5 && 'Configure your first audit'}
              </h2>
              <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {step === 1 && "This forms the foundation of your Searchify project — we'll use it to build your prompt library and identify relevant AI mentions."}
                {step === 4 && "Optional, but recommended. Competitor data transforms your visibility score from a raw number into a meaningful ranking."}
                {step === 5 && "Choose which AI engines to audit and how often. You can change these settings any time after setup."}
              </p>
            </div>

            {step === 1 && (
              <StepBrand
                brandName={brandName} setBrandName={setBrandName}
                domain={domain} setDomain={setDomain}
                description={description} setDescription={setDescription}
                industry={industry} setIndustry={setIndustry}
              />
            )}
            {step === 4 && (
              <StepCompetitors competitors={competitors} setCompetitors={setCompetitors} />
            )}
            {step === 5 && (
              <StepDefaults
                engines={engines} setEngines={setEngines}
                frequency={frequency} setFrequency={setFrequency}
                brandName={brandName} domain={domain} competitors={competitors}
              />
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '16px 48px',
          borderTop: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          background: 'var(--surface-panel)',
        }}>
          {canGoBack && (
            <button
              onClick={() => setStepIdx(i => i - 1)}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              ← Back
            </button>
          )}

          <div style={{ flex: 1 }} />

          {!isLast && step !== 1 && (
            <button
              onClick={() => setStepIdx(i => i + 1)}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Skip for now
            </button>
          )}

          <button
            onClick={() => !isLast ? setStepIdx(i => i + 1) : undefined}
            style={{
              padding: '9px 22px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 1px 3px rgba(39,86,255,0.30), 0 0 0 1px rgba(39,86,255,0.15)',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}
          >
            {isLast ? (
              <>
                Create project
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            ) : (
              <>
                Continue
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            Step {STEPS.findIndex(s => s.n === fullStepMap[step] + 1) + 1 || STEPS.length} of {STEPS.length}
          </span>
        </div>
      </div>

      {/* Right panel */}
      <RightPanel step={step} brandName={brandName} domain={domain} competitors={competitors} />
    </div>
  )
}
