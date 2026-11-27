import {
  chartFill,
  chartStroke,
  SERIES_FILL_OPACITY,
  SERIES_WEIGHT,
  type ChartTone,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

const CX = 200;
const CY = 150;
const RADIUS = 105;
const LABEL_RADIUS = 1.1;
const LABEL_SIZE = 8;
const LABEL_BASELINE = 2.5;
const RINGS = [25, 50, 75, 100];

export type RadarAxis = Readonly<{ key: string; label: string }>;
export type RadarShape = Readonly<{
  key: string;
  values: readonly number[];
  tone: ChartTone;
  lead: boolean;
}>;

function point(index: number, count: number, value: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const reach = (RADIUS * value) / 100;
  return [CX + Math.cos(angle) * reach, CY + Math.sin(angle) * reach] as const;
}

function anchorOf(x: number) {
  if (Math.abs(x - CX) < 1) return 'middle';
  return x > CX ? 'start' : 'end';
}

const polygon = (values: readonly number[]) =>
  values.map((value, index) => point(index, values.length, value).join(',')).join(' ');

export function RadarChart({
  axes,
  shapes,
}: Readonly<{ axes: readonly RadarAxis[]; shapes: readonly RadarShape[] }>) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 400 300" className="block h-auto w-full">
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygon(axes.map(() => ring))}
          className="stroke-rule fill-none"
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = point(index, axes.length, 100);
        const [lx, ly] = point(index, axes.length, 100 * LABEL_RADIUS);
        return (
          <g key={axis.key}>
            <line x1={CX} y1={CY} x2={x} y2={y} className="stroke-rule" />
            <text
              x={lx}
              y={ly + LABEL_BASELINE}
              textAnchor={anchorOf(lx)}
              fontSize={LABEL_SIZE}
              className="fill-ink-2"
            >
              {axis.label}
            </text>
          </g>
        );
      })}
      {shapes.map((shape) => {
        const weight = shape.lead ? 'you' : 'faint';
        return (
          <polygon
            key={shape.key}
            points={polygon(shape.values)}
            className={cn(chartStroke(shape.tone), chartFill(shape.tone))}
            fillOpacity={SERIES_FILL_OPACITY[weight]}
            strokeWidth={SERIES_WEIGHT[weight]}
          />
        );
      })}
    </svg>
  );
}

export function LegendDot({ tone }: Readonly<{ tone: ChartTone | undefined }>) {
  return (
    <svg aria-hidden width={8} height={8} viewBox="0 0 8 8" className="shrink-0">
      <circle cx={4} cy={4} r={4} className={tone ? chartFill(tone) : 'fill-rule'} />
    </svg>
  );
}
