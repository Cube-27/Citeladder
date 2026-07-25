import { useState } from 'react'
import { AppShell } from '../components/AppShell'
import { ScoreRing } from '../components/ScoreRing'
import { Sparkline } from '../components/Sparkline'

interface Props {
  dark?: boolean
}

const COMPETITORS = [
  {
    rank: 1, name: 'Acme Corporation', domain: 'acmecorp.com', you: true,
    visibility: 62.4, sov: 34.8, mentions: 247, citations: 189,
    trend: [55, 58, 57, 60, 58, 62, 62.4],
    delta: +4.2,
  },
  {
    rank: 2, name: 'TechCo', domain: 'techco.io', you: false,
    visibility: 48.7, sov: 27.1, mentions: 183, citations: 142,
    trend: [52, 49, 48, 51, 49, 48, 48.7],
    delta: -1.3,
  },
  {
    rank: 3, name: 'DataFlow Inc', domain: 'dataflow.com', you: false,
    visibility: 45.2, sov: 25.2, mentions: 169, citations: 131,
    trend: [41, 43, 44, 45, 43, 45, 45.2],
    delta: +2.1,
  },
  {
    rank: 4, name: 'Nexus AI', domain: 'nexusai.com', you: false,
    visibility: 39.1, sov: 21.8, mentions: 147, citations: 108,
    trend: [38, 37, 38, 37, 39, 38, 39.1],
    delta: +0.3,
  },
  {
    rank: 5, name: 'Perceptio', domain: 'perceptio.ai', you: false,
    visibility: 30.8, sov: 17.2, mentions: 116, citations: 84,
    trend: [29, 31, 30, 28, 31, 30, 30.8],
    delta: -0.4,
  },
  {
    rank: 6, name: 'SearchPro', domain: 'searchpro.co', you: false,
    visibility: 24.3, sov: 13.5, mentions: 91, citations: 63,
    trend: [25, 24, 26, 25, 24, 24, 24.3],
    delta: -0.8,
  },
]

const BY_MODEL = [
  { engine: 'ChatGPT', color: '#10A37F', visibility: 68.2, mentions: 91, citations: 74, sov: 38.2 },
  { engine: 'Claude', color: '#D97757', visibility: 61.5, mentions: 82, citations: 63, sov: 34.4 },
  { engine: 'Gemini', color: '#4285F4', visibility: 57.5, mentions: 74, citations: 52, sov: 31.6 },
]

const DONUT_DATA = [
  { label: 'Acme Corp', value: 34.8, color: '#2756FF' },
  { label: 'TechCo', value: 27.1, color: '#10B981' },
  { label: 'DataFlow', value: 25.2, color: '#F59E0B' },
  { label: 'Others', value: 12.9, color: '#E2E5EE' },
]

function DonutChart({ data, dark }: { data: typeof DONUT_DATA; dark?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const size = 140
  const sw = 28
  const r = (size - sw) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  let offset = 0
  const segments = data.map((d, i) => {
    const len = (d.value / 100) * circ
    const seg = { ...d, len, offset, i }
    offset += len
    return seg
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {segments.map(seg => (
          <circle
            key={seg.i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={hovered === seg.i ? sw + 3 : sw}
            strokeDasharray={`${seg.len} ${circ - seg.len}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-width 0.15s ease', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(seg.i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500, fill: dark ? '#ECEEF5' : '#0D1228' }}
        >
          {hovered !== null ? `${data[hovered].value}%` : '34.8%'}
        </text>
        <text
          x={cx} y={cy + 12}
          textAnchor="middle"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, fontWeight: 500, fill: dark ? '#4F5872' : '#98A2BE', letterSpacing: '0.04em', textTransform: 'uppercase' }}
        >
          {hovered !== null ? data[hovered].label : 'ACME SoV'}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: dark ? '#868FB0' : 'var(--text-secondary)', flex: 1 }}>{d.label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-mono)', color: dark ? '#ECEEF5' : 'var(--text-primary)' }}>
              {d.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonRow({ dark }: { dark?: boolean }) {
  const bg = dark ? 'rgba(255,255,255,0.07)' : '#E2E5EE'
  return (
    <tr>
      {[32, 120, 60, 60, 60, 60, 80].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, width: w, background: bg, borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  )
}

export function VisibilityDashboard({ dark }: Props) {
  const [tab, setTab] = useState<'overview' | 'trends' | 'mentions' | 'fanout'>('overview')
  const [engine, setEngine] = useState<'all' | 'chatgpt' | 'claude' | 'gemini'>('all')
  const [loading] = useState(false)

  const textPrimary = dark ? '#ECEEF5' : 'var(--text-primary)'
  const textSecondary = dark ? '#868FB0' : 'var(--text-secondary)'
  const textTertiary = dark ? '#4F5872' : 'var(--text-tertiary)'
  const panelBg = dark ? '#0F1118' : 'var(--surface-panel)'
  const pageBg = dark ? '#09090F' : 'var(--surface-page)'
  const borderColor = dark ? '#1F2638' : 'var(--border-default)'
  const borderSubtle = dark ? '#161C28' : 'var(--border-subtle)'
  const tableRowHover = dark ? 'rgba(255,255,255,0.03)' : 'var(--neutral-50)'
  const accentSubtle = dark ? 'rgba(63,106,255,0.12)' : 'var(--blue-50)'

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'mentions', label: 'Mentions & Citations' },
    { id: 'fanout', label: 'Query Fanout' },
  ] as const

  const engines = [
    { id: 'all', label: 'All engines' },
    { id: 'chatgpt', label: 'ChatGPT', color: '#10A37F' },
    { id: 'claude', label: 'Claude', color: '#D97757' },
    { id: 'gemini', label: 'Gemini', color: '#4285F4' },
  ] as const

  const headerContent = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Run selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 7,
        border: `1px solid ${borderColor}`,
        background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-sunken)',
        cursor: 'pointer',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 99, background: '#22C55E' }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: textPrimary }}>Run #47 — Apr 18, 2025</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={textTertiary} strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </div>
      {/* Date range */}
      <div style={{
        padding: '6px 12px',
        borderRadius: 7,
        border: `1px solid ${borderColor}`,
        background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-sunken)',
        fontSize: 12.5,
        color: textSecondary,
        cursor: 'pointer',
      }}>
        Mar 18 – Apr 18, 2025
      </div>
    </div>
  )

  return (
    <div className={dark ? 'dark' : ''} style={{ height: '100%', fontFamily: 'var(--font-sans)' }}>
      <AppShell activeNav="visibility" pageTitle="Visibility" dark={dark} headerContent={headerContent}>
        <div style={{ background: pageBg, minHeight: '100%' }}>

          {/* Filter bar */}
          <div style={{
            padding: '0 28px',
            borderBottom: `1px solid ${borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: panelBg,
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1 }}>
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '14px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: tab === t.id ? (dark ? '#7DA0FF' : 'var(--accent-text)') : textSecondary,
                    fontWeight: tab === t.id ? 500 : 400,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    borderBottom: tab === t.id ? `2px solid ${dark ? '#3F6AFF' : 'var(--accent)'}` : '2px solid transparent',
                    fontFamily: 'var(--font-sans)',
                    marginBottom: -1,
                    transition: 'color 0.1s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Engine filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {engines.map(e => (
                <button
                  key={e.id}
                  onClick={() => setEngine(e.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: `1px solid ${engine === e.id ? (dark ? '#3F6AFF' : 'var(--accent)') : borderColor}`,
                    background: engine === e.id ? (dark ? 'rgba(63,106,255,0.15)' : 'var(--blue-50)') : 'transparent',
                    color: engine === e.id ? (dark ? '#7DA0FF' : 'var(--accent-text)') : textSecondary,
                    fontSize: 12,
                    fontWeight: engine === e.id ? 500 : 400,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {'color' in e && (
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color, display: 'inline-block' }} />
                  )}
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Hero metric */}
            <div style={{
              background: panelBg,
              border: `1px solid ${borderColor}`,
              borderRadius: 12,
              padding: '28px 32px',
              display: 'flex',
              alignItems: 'center',
              gap: 48,
              boxShadow: dark ? 'var(--shadow-1)' : 'var(--shadow-1)',
            }}>
              {/* Score ring */}
              <ScoreRing score={62} size={140} strokeWidth={12} label="Score" showLabel dark={dark} />

              {/* Hero text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  marginBottom: 6,
                  flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: 52,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: '#10B981',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}>
                    62.4%
                  </span>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: dark ? 'rgba(16,185,129,0.12)' : '#F0FDF4',
                    border: `1px solid ${dark ? 'rgba(16,185,129,0.22)' : '#BBF7D0'}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: dark ? '#6EE7B7' : '#15803D',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    ▲ 4.2 pts
                  </div>
                  <span style={{ fontSize: 13.5, color: textTertiary, fontStyle: 'italic' }}>
                    vs. previous run
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: textPrimary, marginBottom: 18, letterSpacing: '-0.01em' }}>
                  Acme Corporation — Visibility Score
                </div>

                {/* Supporting metrics */}
                <div style={{ display: 'flex', gap: 0 }}>
                  {[
                    { label: 'Share of Voice', value: '34.8%', delta: '+1.4%' },
                    { label: 'Mentions', value: '247', delta: '+18' },
                    { label: 'Citations', value: '189', delta: '+12' },
                    { label: 'Avg. Rank', value: '#1.8', delta: '▲ 0.3' },
                  ].map((m, i) => (
                    <div key={m.label} style={{
                      paddingLeft: i > 0 ? 24 : 0,
                      marginLeft: i > 0 ? 24 : 0,
                      borderLeft: i > 0 ? `1px solid ${borderSubtle}` : 'none',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                        {m.label}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: textPrimary, letterSpacing: '-0.02em' }}>
                          {m.value}
                        </span>
                        <span style={{ fontSize: 12, color: dark ? '#6EE7B7' : '#15803D', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                          {m.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Run info */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '16px 20px',
                background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-sunken)',
                borderRadius: 10,
                border: `1px solid ${borderSubtle}`,
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Current audit
                </div>
                {[
                  { label: 'Run', value: '#47' },
                  { label: 'Date', value: 'Apr 18, 2025' },
                  { label: 'Prompts', value: '124' },
                  { label: 'Status', value: 'Completed', status: true },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: textTertiary, width: 52, flexShrink: 0 }}>{r.label}</span>
                    {r.status ? (
                      <span style={{
                        fontSize: 11.5,
                        fontWeight: 500,
                        padding: '1px 7px',
                        borderRadius: 99,
                        background: 'var(--run-completed-bg)',
                        color: 'var(--run-completed-text)',
                      }}>
                        {r.value}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)', color: textPrimary }}>{r.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Competitors table + Share of answers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

              {/* Competitors table */}
              <div style={{
                background: panelBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: dark ? 'var(--shadow-1)' : 'var(--shadow-1)',
              }}>
                <div style={{
                  padding: '16px 20px 12px',
                  borderBottom: `1px solid ${borderSubtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>Competitors</span>
                  <span style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    padding: '1px 7px',
                    borderRadius: 99,
                    background: dark ? 'rgba(255,255,255,0.08)' : 'var(--neutral-100)',
                    color: textTertiary,
                  }}>
                    6 brands
                  </span>
                  <div style={{ flex: 1 }} />
                  <button style={{
                    fontSize: 12,
                    color: dark ? '#3F6AFF' : 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                  }}>
                    Export CSV
                  </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                      {['#', 'Brand', 'Visibility', 'Share of Voice', 'Mentions', 'Citations', 'Trend'].map((h, i) => (
                        <th key={h} style={{
                          padding: '9px 16px',
                          textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left',
                          fontSize: 11,
                          fontWeight: 500,
                          color: textTertiary,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} dark={dark} />)
                    ) : (
                      COMPETITORS.map((c) => (
                        <tr
                          key={c.rank}
                          style={{
                            borderBottom: `1px solid ${borderSubtle}`,
                            background: c.you ? accentSubtle : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.1s ease',
                          }}
                          onMouseOver={e => { if (!c.you) (e.currentTarget as HTMLElement).style.background = tableRowHover }}
                          onMouseOut={e => { if (!c.you) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ padding: '12px 16px', textAlign: 'center', width: 40 }}>
                            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: textTertiary, fontWeight: 500 }}>
                              {c.rank}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                background: c.you
                                  ? (dark ? 'rgba(63,106,255,0.25)' : 'var(--blue-100)')
                                  : (dark ? 'rgba(255,255,255,0.08)' : 'var(--neutral-100)'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 600,
                                color: c.you ? (dark ? '#7DA0FF' : 'var(--blue-700)') : textTertiary,
                                flexShrink: 0,
                              }}>
                                {c.name[0]}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13.5, fontWeight: c.you ? 600 : 400, color: textPrimary }}>
                                    {c.name}
                                  </span>
                                  {c.you && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 6px',
                                      borderRadius: 99,
                                      background: dark ? 'rgba(63,106,255,0.25)' : 'var(--blue-100)',
                                      color: dark ? '#7DA0FF' : 'var(--blue-700)',
                                      letterSpacing: '0.04em',
                                    }}>
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11.5, color: textTertiary, fontFamily: 'var(--font-mono)' }}>
                                  {c.domain}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              fontFamily: 'var(--font-mono)',
                              color: c.you ? (dark ? '#6EE7B7' : '#10B981') : textPrimary,
                            }}>
                              {c.visibility.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: textSecondary }}>
                              {c.sov.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: textSecondary }}>
                              {c.mentions.toLocaleString()}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: textSecondary }}>
                              {c.citations.toLocaleString()}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                              <Sparkline data={c.trend} width={72} height={28} />
                              <span style={{
                                fontSize: 11.5,
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 500,
                                color: c.delta >= 0
                                  ? (dark ? '#6EE7B7' : '#15803D')
                                  : (dark ? '#FC8181' : '#B91C1C'),
                                width: 44,
                                textAlign: 'right',
                              }}>
                                {c.delta >= 0 ? '+' : ''}{c.delta.toFixed(1)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Skeleton empty state label */}
                {!loading && (
                  <div style={{
                    padding: '10px 20px',
                    display: 'flex',
                    justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 12, color: textTertiary }}>
                      Showing all 6 tracked brands · Run #47
                    </span>
                  </div>
                )}
              </div>

              {/* Right column: share of answers + model comparison */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Donut chart */}
                <div style={{
                  background: panelBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  boxShadow: dark ? 'var(--shadow-1)' : 'var(--shadow-1)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 16 }}>
                    Share of answers
                  </div>
                  <DonutChart data={DONUT_DATA} dark={dark} />
                </div>

                {/* By model */}
                <div style={{
                  background: panelBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: dark ? 'var(--shadow-1)' : 'var(--shadow-1)',
                }}>
                  <div style={{
                    padding: '14px 18px',
                    borderBottom: `1px solid ${borderSubtle}`,
                    fontSize: 14,
                    fontWeight: 600,
                    color: textPrimary,
                  }}>
                    By model
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                        {['Engine', 'Visibility', 'SoV'].map((h, i) => (
                          <th key={h} style={{
                            padding: '8px 12px',
                            textAlign: i === 0 ? 'left' : 'right',
                            fontSize: 10.5,
                            fontWeight: 500,
                            color: textTertiary,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {BY_MODEL.map((m) => (
                        <tr key={m.engine} style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                          <td style={{ padding: '11px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{
                                width: 20,
                                height: 20,
                                borderRadius: 5,
                                background: m.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 9.5,
                                fontWeight: 700,
                                color: 'white',
                                flexShrink: 0,
                              }}>
                                {m.engine[0]}
                              </div>
                              <span style={{ fontSize: 13, color: textPrimary, fontWeight: 500 }}>{m.engine}</span>
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: textPrimary }}>
                              {m.visibility}%
                            </span>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: textSecondary }}>
                              {m.sov}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      </AppShell>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </div>
  )
}
