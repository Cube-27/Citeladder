/** Bar left edges and heights in a 13×12 box, lowest first. */
const BARS = [
  { x: 0, height: 5 },
  { x: 5, height: 8 },
  { x: 10, height: 12 },
] as const;

/**
 * A row's impact: three rising bars, as many filled as the level, then its
 * word. Quieter than a priority StatusMark, for dense rows where every row
 * carries one. Its word takes the text role of the cell or fact it sits in.
 */
export function ImpactBars({ level, children }: Readonly<{ level: 1 | 2 | 3; children: string }>) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <svg aria-hidden width={13} height={12} viewBox="0 0 13 12" className="shrink-0">
        {BARS.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={12 - bar.height}
            width={3}
            height={bar.height}
            rx={1}
            className={index < level ? 'fill-ink' : 'fill-control-line'}
          />
        ))}
      </svg>
      {children}
    </span>
  );
}
