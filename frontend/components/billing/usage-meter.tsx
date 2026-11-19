import type { ReactNode } from 'react';

import { USAGE_METER_CRITICAL_RATIO, USAGE_METER_WARNING_RATIO } from '@/lib/config/billing';
import type { UsageItem } from '@/lib/api/billing';
import { Absence } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DisplayTime } from '@/components/ui/display-time';
import { InfoHint } from '@/components/ui/info-hint';
import { Inline } from '@/components/ui/layout';
import { CellMeter, type MeterTone } from '@/components/ui/meter';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatCount } from '@/lib/format';

/**
 * Usage limits: one table for every state, a row per quota.
 *
 * `limit_state` is the ONLY authority for what the numbers mean. The backend
 * never uses null to mean both "unlimited" and "unresolved", so neither does
 * this table: an `unlimited` row shows what has been consumed with no bar and
 * no ceiling, and an `unknown` row says so rather than rendering zero. A
 * missing allowance is never drawn as an empty meter — that reads as "none
 * left" when it means "we don't know". The Usage column shows only once
 * something is used; with nothing used every bar would be empty.
 */
export function UsageTable({ items }: Readonly<{ items: readonly UsageItem[] }>) {
  // A held reservation is usage too.
  const metered = items.some((item) => (item.consumed ?? 0) > 0 || Boolean(item.reserved));
  return (
    <DataTable label="Usage limits" columns={metered ? METERED_COLUMNS : COLUMNS}>
      {items.map((item) => (
        <UsageRow key={item.key} item={item} metered={metered} />
      ))}
    </DataTable>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'quota', label: 'Quota', kind: 'identity' },
  { key: 'used', label: 'Used', kind: 'number' },
  { key: 'allowance', label: 'Allowance', kind: 'number' },
  { key: 'remaining', label: 'Remaining', kind: 'number' },
];
const METERED_COLUMNS: readonly DataTableColumn[] = [
  ...COLUMNS,
  { key: 'usage', label: 'Usage', kind: 'text', width: 'metric' },
];

type Figures = Readonly<{ used: ReactNode; allowance: ReactNode; remaining: ReactNode }>;

const count = (value: number | null) =>
  value === null ? <Absence state="not_measured" /> : formatCount(value);

/** The row's three figures, by `limit_state`. */
function figuresOf(item: UsageItem): Figures {
  switch (item.limit_state) {
    case 'unknown':
      return {
        used: <Absence state="unavailable" />,
        allowance: <Absence state="unavailable" />,
        remaining: <Absence state="unavailable" />,
      };
    case 'unlimited':
      return {
        used: count(item.consumed),
        allowance: 'Unlimited',
        remaining: <Absence state="not_applicable" />,
      };
    case 'finite': {
      // `finite`: the backend guarantees every numeric aggregate is present.
      const allowance = item.allowance ?? 0;
      const consumed = item.consumed ?? 0;
      // A real zero limit with nothing used: the plan does not include it.
      if (allowance === 0 && consumed === 0)
        return {
          used: formatCount(0),
          // A plan fact the reader can act on (upgrade), so it stays a word.
          allowance: 'Not included',
          remaining: <Absence state="not_applicable" />,
        };
      return {
        used: formatCount(consumed),
        allowance: formatCount(allowance),
        remaining: formatCount(item.remaining ?? 0),
      };
    }
    default: {
      const unreachable: never = item.limit_state;
      return unreachable;
    }
  }
}

function UsageRow({ item, metered }: Readonly<{ item: UsageItem; metered: boolean }>) {
  const { label, unit } = usageLabel(item);
  const figures = figuresOf(item);
  const note = quotaNote(item, unit);
  return (
    <TableRow>
      <TableCell>
        <Inline as="span">
          <ClampText>{label}</ClampText>
          {note ? <InfoHint label={`About ${label}`}>{note}</InfoHint> : null}
        </Inline>
      </TableCell>
      <TableCell numeric>{figures.used}</TableCell>
      <TableCell numeric>{figures.allowance}</TableCell>
      <TableCell numeric>{figures.remaining}</TableCell>
      {metered ? (
        <TableCell>
          <UsageBar item={item} label={label} unit={unit} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** What the figures leave out: an unresolved allowance, a reservation, a reset or an expiry. */
function quotaNote(item: UsageItem, unit: string): ReactNode {
  if (item.limit_state === 'unknown') return 'Allowance unresolved.';
  const reserved = item.reserved ? `${formatCount(item.reserved)} ${unit} reserved. ` : null;
  const timing = timingNote(item, unit);
  if (!reserved && !timing) return null;
  return (
    <>
      {reserved}
      {timing}
    </>
  );
}

/**
 * Reset and expiry copy. Consumable balances forfeit at expiry, so that has to
 * be visible next to the balance rather than only at purchase.
 */
function timingNote(item: UsageItem, unit: string): ReactNode {
  if (item.resets_at)
    return (
      <>
        Resets <DisplayTime value={item.resets_at} dateOnly />.
      </>
    );
  if (!item.earliest_expiry) return null;
  // Only a consumable balance is forfeited; a slot allowance simply ends.
  return (
    <>
      {item.capability_type === 'counter.consumable' ? `Unused ${unit} expire` : 'Ends'}{' '}
      <DisplayTime value={item.earliest_expiry} dateOnly />.
    </>
  );
}

/** `ink` below 80% of the allowance, `warning` from it, `negative` at the limit. */
function toneOf(consumed: number, allowance: number): MeterTone {
  if (allowance <= 0) return consumed > 0 ? 'negative' : 'ink';
  const ratio = consumed / allowance;
  if (ratio >= USAGE_METER_CRITICAL_RATIO) return 'negative';
  if (ratio >= USAGE_METER_WARNING_RATIO) return 'warning';
  return 'ink';
}

/** A finite quota's use against its allowance; any other row has no bar, and the cell says why. */
function UsageBar({
  item,
  label,
  unit,
}: Readonly<{ item: UsageItem; label: string; unit: string }>) {
  if (item.limit_state === 'unknown') return <Absence state="unavailable" />;
  const allowance = item.allowance ?? 0;
  const consumed = item.consumed ?? 0;
  if (item.limit_state === 'unlimited' || (allowance === 0 && consumed === 0))
    return <Absence state="not_applicable" />;
  return (
    <CellMeter
      label={label}
      value={consumed}
      max={allowance}
      valueText={`${formatCount(consumed)} of ${formatCount(allowance)} ${unit}`}
      tone={toneOf(consumed, allowance)}
    />
  );
}

/** Reader-facing names for the backend's counter keys. The key is the backend's, the label is ours. */
const USAGE_LABELS: Readonly<Record<string, { label: string; unit: string }>> = {
  prompt_slots: { label: 'Prompts', unit: 'prompts' },
  project_slots: { label: 'Projects', unit: 'projects' },
  monitored_urls: { label: 'Monitored URLs', unit: 'URLs' },
  manual_runs_per_day: { label: 'Manual runs today', unit: 'runs' },
  prompt_runs_per_period: { label: 'Prompt runs', unit: 'runs' },
  ai_credits: { label: 'AI credits', unit: 'credits' },
  api_keys: { label: 'API keys', unit: 'keys' },
  market_slots: { label: 'Extra markets', unit: 'markets' },
  site_health_page_fetches_per_period: { label: 'Website page fetches', unit: 'fetches' },
};

/** A key this map does not name still renders: `new_counter` → `New counter`. */
function usageLabel(item: UsageItem) {
  const known = USAGE_LABELS[item.key];
  if (known) return known;
  const words = item.key.replaceAll('_', ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), unit: item.unit };
}
