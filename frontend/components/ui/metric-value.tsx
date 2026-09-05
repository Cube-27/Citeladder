import { Spinner } from '@/components/ui/spinner';
import { textRole, type TextRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * MetricValue — one numeral slot, with its three states owned in one place.
 *
 * A value slot is always exactly one of:
 *
 *   - **loading** — a spinner. Not a placeholder: a refetch in flight does not
 *     mean the value is missing, and rendering "Not measured" for the second
 *     it takes states something the surface does not know yet.
 *   - **missing** — the explicit label, at the SHARED placeholder size and
 *     weight rather than the numeral's. "Not measured" set at 28px reads as a
 *     headline announcement of an absence; it is a footnote about one figure.
 *   - **measured** — the value, at the caller's numeral role.
 *
 * Every state occupies the SAME box. The slot reserves the numeral's line
 * height, so a card does not resize when its value arrives, disappears, or
 * starts reloading — the row beneath it must not move under the reader's
 * pointer.
 */

/** Line box per numeral role, so the slot is the same height in every state. */
const SLOT_HEIGHT = {
  metric: 'min-h-9',
  metricSm: 'min-h-6',
} as const;

export type MetricValueSize = keyof typeof SLOT_HEIGHT;

export function MetricValue({
  value,
  label,
  size = 'metric',
  loading = false,
  tone,
  className,
}: Readonly<{
  /** The formatted value, or null when the window measured nothing for it. */
  value: string | null;
  /** The missing-state label, e.g. "Not measured". */
  label: string;
  size?: MetricValueSize;
  loading?: boolean;
  /** Ink override — an on-accent card passes its own foreground. */
  tone?: string;
  className?: string;
}>) {
  const slot = cn('flex items-center', SLOT_HEIGHT[size], className);
  if (loading) {
    return (
      <div className={slot}>
        <Spinner size={size === 'metric' ? 'md' : 'sm'} label="Loading" className={tone} />
      </div>
    );
  }
  if (value === null) {
    // The shared placeholder role: same size and weight wherever a figure is
    // absent, on every surface.
    return (
      <div className={slot}>
        <span className={textRole(PLACEHOLDER_ROLE, tone)}>{label}</span>
      </div>
    );
  }
  return (
    <div className={slot}>
      <span className={textRole(size, tone)}>{value}</span>
    </div>
  );
}

/** One role for every missing-figure label in the app. 12/400. */
const PLACEHOLDER_ROLE: TextRole = 'meta';
