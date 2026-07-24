import { cn } from '@/lib/utils';

/**
 * Sparkline — a 52×16 inline trend glyph for table cells (competitors, prompts,
 * products, site-health scores).
 *
 * Deliberately minimal: no axes, no fill, no dots, no tooltip. It shows SHAPE
 * only; the adjacent cell carries the number, so the sparkline is never the
 * sole carrier of a value (WCAG 1.4.1). It is marked `aria-hidden` when a
 * `label` is not supplied precisely because the row already states the figure.
 *
 * `tone` picks the stroke: 'brand' for the user's own series (accent), 'muted'
 * for everyone else — so a competitor's shape never competes with the brand's.
 */
export function Sparkline({
  values,
  tone = 'muted',
  label,
  className,
  width = 52,
  height = 16,
}: Readonly<{
  values: number[];
  tone?: 'brand' | 'muted';
  /** When set, the glyph is announced; otherwise it is decorative. */
  label?: string;
  className?: string;
  width?: number;
  height?: number;
}>) {
  const clean = values.filter((v) => Number.isFinite(v));

  // Fewer than two points cannot describe a trend — render an empty box so the
  // column keeps its rhythm rather than collapsing.
  if (clean.length < 2) {
    return <svg width={width} height={height} className={cn('block', className)} aria-hidden />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min;
  // Inset by the stroke's half-width so the extremes are not clipped.
  const pad = 1;
  const stepX = (width - pad * 2) / (clean.length - 1);

  const points = clean
    .map((v, i) => {
      const x = pad + i * stepX;
      // A flat series sits on the vertical centre instead of dividing by zero.
      const t = span === 0 ? 0.5 : (v - min) / span;
      const y = pad + (height - pad * 2) * (1 - t);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block overflow-visible', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {label ? <title>{label}</title> : null}
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={tone === 'brand' ? 'stroke-accent' : 'stroke-subtle'}
      />
    </svg>
  );
}
