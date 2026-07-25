import { useState } from 'react'
import { AppShell } from '../components/AppShell'
import { ScoreRing } from '../components/ScoreRing'

const ISSUES = [
  {
    id: 1,
    severity: 'critical' as const,
    title: 'Missing structured data markup',
    desc: 'No JSON-LD or Microdata schema found on this page. Structured data significantly improves AI answer eligibility.',
    remediation: 'Add an Organization, Product, or FAQ schema using JSON-LD in the <head> tag. Use schema.org/Product for product pages. Validate with Google\'s Rich Results Test before deploying.',
    expandable: true,
  },
  {
    id: 2,
    severity: 'critical' as const,
    title: 'No FAQ schema detected',
    desc: 'FAQ schema increases the probability of content being pulled into AI-generated answers. This page has Q&A-style content but no FAQPage markup.',
    remediation: 'Identify 3–5 question/answer pairs on this page and wrap them in FAQPage JSON-LD. Each Question must have an acceptedAnswer property.',
    expandable: true,
  },
  {
    id: 3,
    severity: 'warning' as const,
    title: 'Meta description exceeds 160 characters',
    desc: 'Current meta description is 187 characters (recommended max: 160). Truncated descriptions perform worse in AI summarization.',
    expandable: false,
    remediation: '',
  },
  {
    id: 4,
    severity: 'warning' as const,
    title: '4 images missing alt text',
    desc: 'Alt text improves accessibility and provides context for AI parsing. Images without descriptions are skipped during content extraction.',
    expandable: false,
    remediation: '',
  },
  {
    id: 5,
    severity: 'warning' as const,
    title: 'No H2 headings found',
    desc: 'This page uses H3–H6 headings but skips H2, breaking semantic structure. AI models rely on heading hierarchy to understand content organization.',
    expandable: false,
    remediation: '',
  },
  {
    id: 6,
    severity: 'info' as const,
    title: 'Slow server response time (>300ms TTFB)',
    desc: 'TTFB of 324ms exceeds the recommended 200ms threshold. Slower pages are crawled less frequently.',
    expandable: false,
    remediation: '',
  },
  {
    id: 7,
    severity: 'info' as const,
    title: 'Reading level is Grade 12+',
    desc: 'Current Flesch-Kincaid grade: 12.4. AI models favor content readable at Grade 8–10. Simplifying language can improve mention frequency.',
    expandable: false,
    remediation: '',
  },
]

const ISSUE_HISTORY = [
  { date: 'Apr 18, 2025', crawl: 47, issues: 7, critical: 2, warning: 3, info: 2, change: '-1' },
  { date: 'Apr 14, 2025', crawl: 45, issues: 8, critical: 2, warning: 4, info: 2, change: '-1' },
  { date: 'Apr 7, 2025', crawl: 43, issues: 9, critical: 3, warning: 4, info: 2, change: '+1' },
  { date: 'Mar 31, 2025', crawl: 41, issues: 10, critical: 3, warning: 5, info: 2, change: 'New' },
]

const DELIVERY_METRICS = [
  { label: 'Response Time', value: '324ms', mono: true, warn: true },
  { label: 'TTFB', value: '187ms', mono: true, warn: true },
  { label: 'Page Size', value: '2.4 MB', mono: true, warn: false },
  { label: 'Compression', value: 'Gzip', mono: false, warn: false },
  { label: 'Redirects', value: '1', mono: true, warn: false },
  { label: 'HTTP Status', value: '200 OK', mono: false, warn: false },
  { label: 'Cache-Control', value: 'max-age=86400', mono: true, warn: false },
  { label: 'Content Type', value: 'text/html', mono: false, warn: false },
]

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const styles = {
    critical: {
      bg: 'var(--danger-bg)',
      border: 'var(--danger-border)',
      text: 'var(--danger-text)',
      label: 'Critical',
      dot: '#EF4444',
    },
    warning: {
      bg: 'var(--warning-bg)',
      border: 'var(--warning-border)',
      text: 'var(--warning-text)',
      label: 'Warning',
      dot: '#F59E0B',
    },
    info: {
      bg: 'var(--info-bg)',
      border: 'var(--info-border)',
      text: 'var(--info-text)',
      label: 'Info',
      dot: '#2756FF',
    },
  }
  const s = styles[severity]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 99,
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

export function SiteHealthDetail() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]))

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const border = 'var(--border-default)'
  const borderSubtle = 'var(--border-subtle)'
  const panelBg = 'var(--surface-panel)'
  const pageBg = 'var(--surface-page)'
  const sunken = 'var(--surface-sunken)'
  const textPrimary = 'var(--text-primary)'
  const textSecondary = 'var(--text-secondary)'
  const textTertiary = 'var(--text-tertiary)'

  const breadcrumb = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: textSecondary }}>
      <span style={{ color: 'var(--text-link)', cursor: 'pointer' }}>Site Health</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 3L7.5 6L4.5 9"/></svg>
      <span style={{ cursor: 'pointer', color: 'var(--text-link)' }}>Crawl Apr 18</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 3L7.5 6L4.5 9"/></svg>
      <span style={{ cursor: 'pointer', color: 'var(--text-link)' }}>Pages</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 3L7.5 6L4.5 9"/></svg>
      <span style={{ color: textTertiary, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        /products/data-analytics-platform
      </span>
    </div>
  )

  return (
    <div style={{ height: '100%', fontFamily: 'var(--font-sans)' }}>
      <AppShell activeNav="health" pageTitle="Site Health" headerContent={breadcrumb}>
        <div style={{ background: pageBg, minHeight: '100%', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* URL header card */}
          <div style={{
            background: panelBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: '20px 24px',
            boxShadow: 'var(--shadow-1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13.5,
                    color: textPrimary,
                    background: sunken,
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: `1px solid ${borderSubtle}`,
                    maxWidth: 580,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                  }}>
                    https://acmecorp.com/products/data-analytics-platform
                  </span>
                  {/* Copy */}
                  <button style={{
                    padding: '5px 9px',
                    borderRadius: 6,
                    border: `1px solid ${border}`,
                    background: 'transparent',
                    cursor: 'pointer',
                    color: textTertiary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                  </button>
                  {/* External link */}
                  <button style={{
                    padding: '5px 9px',
                    borderRadius: 6,
                    border: `1px solid ${border}`,
                    background: 'transparent',
                    cursor: 'pointer',
                    color: textTertiary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    {
                      label: 'HTTP status',
                      value: (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                          background: 'var(--success-bg)', color: 'var(--success-text)',
                          border: '1px solid var(--success-border)', borderRadius: 5, padding: '1px 8px',
                        }}>
                          ● 200 OK
                        </span>
                      ),
                    },
                    { label: 'Content type', value: 'text/html' },
                    { label: 'Last crawled', value: '2 hours ago' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.label}</span>
                      <span style={{ fontSize: 13.5, color: textPrimary }}>
                        {typeof item.value === 'string' ? item.value : item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${borderSubtle}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Page title
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: textPrimary, marginBottom: 10 }}>
                Enterprise Data Analytics Platform | Acme Corporation
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                Meta description
              </div>
              <div style={{ fontSize: 13.5, color: textSecondary, lineHeight: 1.5, maxWidth: 680 }}>
                Transform your data into actionable insights with Acme's enterprise analytics platform. Purpose-built for marketing and growth teams managing complex, multi-channel data ecosystems.{' '}
                <span style={{
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--warning-bg)',
                  color: 'var(--warning-text)',
                  border: '1px solid var(--warning-border)',
                  borderRadius: 4,
                  padding: '0 5px',
                  marginLeft: 4,
                }}>
                  187 chars
                </span>
              </div>
            </div>
          </div>

          {/* Score tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { label: 'Technical Health', score: 73, desc: 'Performance, crawlability, and HTTP fundamentals' },
              { label: 'AEO Health', score: 48, desc: 'Answer Engine Optimization — AI-readiness signals' },
              { label: 'Combined Score', score: 61, desc: 'Weighted average of Technical and AEO scores' },
            ].map(tile => (
              <div key={tile.label} style={{
                background: panelBg,
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: '24px 24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                boxShadow: 'var(--shadow-2)',
                textAlign: 'center',
              }}>
                <ScoreRing score={tile.score} size={128} strokeWidth={11} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: textPrimary, marginBottom: 5 }}>{tile.label}</div>
                  <div style={{ fontSize: 12.5, color: textTertiary, lineHeight: 1.5, maxWidth: 200 }}>{tile.desc}</div>
                </div>
                <div style={{
                  padding: '5px 12px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 500,
                  ...(tile.score < 60 ? {
                    background: 'var(--score-mid-bg)',
                    border: '1px solid var(--score-mid-border)',
                    color: 'var(--score-mid-text)',
                  } : {
                    background: 'var(--score-good-bg)',
                    border: '1px solid var(--score-good-border)',
                    color: 'var(--score-good-text)',
                  }),
                }}>
                  {tile.score < 30 ? 'Poor' : tile.score < 60 ? 'Needs work' : tile.score < 80 ? 'Good' : 'Excellent'}
                </div>
              </div>
            ))}
          </div>

          {/* Delivery metrics */}
          <div style={{
            background: panelBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: '18px 24px',
            boxShadow: 'var(--shadow-1)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 16 }}>Delivery Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
              {DELIVERY_METRICS.map((m, i) => (
                <div key={m.label} style={{
                  padding: '12px 16px',
                  borderRight: (i + 1) % 4 !== 0 ? `1px solid ${borderSubtle}` : 'none',
                  borderBottom: i < 4 ? `1px solid ${borderSubtle}` : 'none',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {m.label}
                  </div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: m.mono ? 'var(--font-mono)' : undefined,
                    color: m.warn ? 'var(--warning-text)' : textPrimary,
                  }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Issues + History grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

            {/* Issues list */}
            <div style={{
              background: panelBg,
              border: `1px solid ${border}`,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-1)',
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>All Issues</span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 99,
                  background: sunken,
                  border: `1px solid ${border}`,
                  fontSize: 12,
                  fontWeight: 500,
                  color: textSecondary,
                }}>
                  7
                </span>
                <div style={{ flex: 1 }} />
                {/* Legend */}
                {[
                  { label: '2 critical', color: '#EF4444' },
                  { label: '3 warnings', color: '#F59E0B' },
                  { label: '2 info', color: '#2756FF' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: textTertiary }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: l.color, display: 'inline-block' }} />
                    {l.label}
                  </div>
                ))}
              </div>

              <div>
                {ISSUES.map((issue, idx) => {
                  const isExpanded = expanded.has(issue.id)
                  return (
                    <div key={issue.id} style={{ borderBottom: idx < ISSUES.length - 1 ? `1px solid ${borderSubtle}` : 'none' }}>
                      <div
                        style={{
                          padding: '14px 20px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 14,
                          cursor: issue.expandable ? 'pointer' : 'default',
                          background: isExpanded ? (issue.severity === 'critical' ? 'rgba(239,68,68,0.03)' : 'transparent') : 'transparent',
                          transition: 'background 0.1s ease',
                        }}
                        onClick={() => issue.expandable && toggleExpand(issue.id)}
                      >
                        <div style={{ marginTop: 1, flexShrink: 0 }}>
                          <SeverityBadge severity={issue.severity} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            color: textPrimary,
                            marginBottom: 3,
                            lineHeight: 1.4,
                          }}>
                            {issue.title}
                          </div>
                          <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.5 }}>
                            {issue.desc}
                          </div>
                        </div>
                        {issue.expandable && (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke={textTertiary}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            style={{
                              flexShrink: 0,
                              marginTop: 2,
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s ease',
                            }}
                          >
                            <path d="M5.25 3.5L8.75 7L5.25 10.5" />
                          </svg>
                        )}
                      </div>

                      {/* Expanded remediation */}
                      {isExpanded && issue.expandable && (
                        <div style={{
                          margin: '0 20px 14px',
                          padding: '14px 16px',
                          background: sunken,
                          border: `1px solid ${borderSubtle}`,
                          borderRadius: 8,
                        }}>
                          <div style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: textTertiary,
                            letterSpacing: '0.07em',
                            textTransform: 'uppercase',
                            marginBottom: 8,
                          }}>
                            Remediation guidance
                          </div>
                          <p style={{ fontSize: 13.5, color: textSecondary, lineHeight: 1.6, margin: 0 }}>
                            {issue.remediation}
                          </p>
                          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <button style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              border: '1px solid var(--accent-border)',
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent-text)',
                              fontSize: 12.5,
                              fontWeight: 500,
                              cursor: 'pointer',
                              fontFamily: 'var(--font-sans)',
                            }}>
                              View in docs →
                            </button>
                            <button style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              border: `1px solid ${border}`,
                              background: 'transparent',
                              color: textSecondary,
                              fontSize: 12.5,
                              cursor: 'pointer',
                              fontFamily: 'var(--font-sans)',
                            }}>
                              Mark resolved
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Issue history */}
            <div style={{
              background: panelBg,
              border: `1px solid ${border}`,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-1)',
              alignSelf: 'start',
            }}>
              <div style={{
                padding: '16px 18px',
                borderBottom: `1px solid ${borderSubtle}`,
                fontSize: 14,
                fontWeight: 600,
                color: textPrimary,
              }}>
                Issue history
              </div>

              <div>
                {ISSUE_HISTORY.map((h, i) => (
                  <div key={h.crawl} style={{
                    padding: '14px 18px',
                    borderBottom: i < ISSUE_HISTORY.length - 1 ? `1px solid ${borderSubtle}` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>{h.date}</div>
                        <div style={{ fontSize: 11.5, color: textTertiary, fontFamily: 'var(--font-mono)' }}>Crawl #{h.crawl}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 99,
                          fontFamily: 'var(--font-mono)',
                          background: h.change.startsWith('+')
                            ? 'var(--danger-bg)' : h.change.startsWith('-')
                              ? 'var(--success-bg)' : 'var(--info-bg)',
                          color: h.change.startsWith('+')
                            ? 'var(--danger-text)' : h.change.startsWith('-')
                              ? 'var(--success-text)' : 'var(--info-text)',
                        }}>
                          {h.change} issues
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: 'Critical', count: h.critical, color: '#EF4444' },
                        { label: 'Warning', count: h.warning, color: '#F59E0B' },
                        { label: 'Info', count: h.info, color: '#2756FF' },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: s.color, display: 'inline-block' }} />
                          <span style={{ fontSize: 12, color: textTertiary }}>{s.count}</span>
                        </div>
                      ))}
                      <span style={{ fontSize: 12, color: textTertiary, marginLeft: 'auto' }}>
                        {h.issues} total
                      </span>
                    </div>
                    {/* Mini bar chart */}
                    <div style={{ display: 'flex', gap: 2, marginTop: 8, height: 4, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ flex: h.critical, background: '#EF4444', borderRadius: '99px 0 0 99px', opacity: 0.8 }} />
                      <div style={{ flex: h.warning, background: '#F59E0B', opacity: 0.8 }} />
                      <div style={{ flex: h.info, background: '#4D7BFF', borderRadius: '0 99px 99px 0', opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Trend note */}
              <div style={{
                padding: '12px 18px',
                borderTop: `1px solid ${borderSubtle}`,
                background: sunken,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success-text)" strokeWidth="2" strokeLinecap="round"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/></svg>
                  <span style={{ fontSize: 12.5, color: 'var(--success-text)', fontWeight: 500 }}>Improving</span>
                  <span style={{ fontSize: 12.5, color: textTertiary }}>— 3 issues fixed in 4 weeks</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  )
}
