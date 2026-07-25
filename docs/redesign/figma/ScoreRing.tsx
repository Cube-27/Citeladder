interface ScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
  label?: string
  showLabel?: boolean
  dark?: boolean
}

function getBand(score: number) {
  if (score < 30) return { ring: '#EF4444', text: '#B91C1C', darkText: '#FC8181' }
  if (score < 60) return { ring: '#F59E0B', text: '#92400E', darkText: '#FCD34D' }
  if (score < 80) return { ring: '#10B981', text: '#065F46', darkText: '#6EE7B7' }
  return { ring: '#22C55E', text: '#14532D', darkText: '#86EFAC' }
}

export function ScoreRing({ score, size = 120, strokeWidth = 10, label, showLabel = true, dark }: ScoreRingProps) {
  const band = getBand(score)
  const textColor = dark ? band.darkText : band.text
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = Math.min(score / 100, 1) * circ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={band.ring}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Score number */}
        <text
          x={cx}
          y={label ? cy - size * 0.08 : cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: Math.round(size * 0.22),
            fontWeight: 500,
            fill: textColor,
          }}
        >
          {score}
        </text>
        {/* Label inside ring */}
        {label && showLabel && (
          <text
            x={cx}
            y={cy + size * 0.15}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: Math.round(size * 0.095),
              fontWeight: 500,
              fill: dark ? 'rgba(255,255,255,0.45)' : 'var(--text-tertiary)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}
