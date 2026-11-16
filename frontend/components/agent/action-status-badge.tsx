import { StatusMark } from '@/components/ui/status-mark';
import {
  ACTION_MEASUREMENT_LABEL,
  ACTION_STATUS_LABEL,
  ACTION_STATUS_TONE,
} from '@/lib/agent/vocabulary';
import type { ActionStatus } from '@/lib/api/actions';
import type { ActionMeasurement } from '@citeladder/contracts/actions';

/**
 * An Action's workflow status: a labelled state mark, never colour alone. A
 * Done Action names its measurement too ("Done · Measuring").
 */
export function ActionStatusBadge({
  status,
  measurement = null,
}: Readonly<{ status: ActionStatus; measurement?: ActionMeasurement | null }>) {
  const tone = ACTION_STATUS_TONE[status];
  const label = measurement
    ? `${ACTION_STATUS_LABEL[status]} · ${ACTION_MEASUREMENT_LABEL[measurement]}`
    : ACTION_STATUS_LABEL[status];
  // New and Declined are the neutral tone: the well fill and its plain glyph.
  return tone === 'neutral' ? (
    <StatusMark tone="neutral">{label}</StatusMark>
  ) : (
    <StatusMark variant="status" value={tone}>
      {label}
    </StatusMark>
  );
}
