interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 80, height = 28, color }: SparklineProps) {
  if (!data || data.length < 2) return <span style={{ display: 'inline-block', width, height }} />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (v - min) / range) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const trend = data[data.length - 1] - data[0]
  const lineColor = color ?? (trend >= 0 ? '#10B981' : '#EF4444')

  const lastX = pad + (width - pad * 2)
  const lastY = pad + (1 - (data[data.length - 1] - min) / range) * (height - pad * 2)

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={lineColor} />
    </svg>
  )
}
