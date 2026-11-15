import { USAGE_METER_CRITICAL_RATIO, USAGE_METER_WARNING_RATIO } from '@/lib/config/billing';
import type { UsageItem } from '@/lib/api/billing';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { MeterLabelRow } from '@/components/ui/meter';
import { RungMeter } from '@/components/ui/rung-meter';
import { InlineFigure, textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { Absence } from '@/components/ui/absence';

/**
 * One usage counter.
 *
 * `limit_state` is the ONLY authority for what the numbers mean. The backend
 * never uses null to mean both "unlimited" and "unresolved", so neither does
 * this component: an `unlimited` row shows what has been consumed with no bar
 * and no ceiling, and an `unknown` row says so rather than rendering zero. A
 * missing allowance is never drawn as an empty meter — that reads as "none
 * left" when it means "we don't know".
 */
export function UsageMeter({ item }: Readonly<{ item: UsageItem }>) {
  const { label, unit } = usageLabel(item);

  if (item.limit_state === 'unknown') {
    return (
      <Stack gap="tight">
        <MeterLabelRow>
          <span className={textRole('body', 'text-ink-2')}>{label}</span>
          <Absence state="unavailable" label="Not available" />
        </MeterLabelRow>
        <p className="type-caption">This allowance could not be resolved, so no usage is shown.</p>
      </Stack>
    );
  }

  if (item.limit_state === 'unlimited') {
    return (
      <Stack gap="tight">
        <MeterLabelRow>
          <span className={textRole('body', 'text-ink-2')}>{label}</span>
          {/* Unlimited says nothing about consumption: an unread count is
              the missing mark, never a zero. */}
          <span className={textRole('body', 'text-ink-2')}>
            {item.consumed === null ? (
              <Absence state="not_measured" />
            ) : (
              <>
                <InlineFigure>{formatCount(item.consumed)}</InlineFigure> {unit}
              </>
            )}
          </span>
        </MeterLabelRow>
        <MeterLabelRow>
          <span className="type-caption">Unlimited</span>
          <ExpiryLine item={item} unit={unit} />
        </MeterLabelRow>
      </Stack>
    );
  }

  // `finite`: the backend guarantees every numeric aggregate is present.
  const allowance = item.allowance ?? 0;
  const consumed = item.consumed ?? 0;
  const remaining = item.remaining ?? 0;

  // A real zero limit with nothing used: the plan does not include it. An
  // empty "0 / 0" bar would read like an exhausted allowance.
  if (allowance === 0 && consumed === 0) {
    return (
      <MeterLabelRow>
        <span className={textRole('body', 'text-ink-2')}>{label}</span>
        <Absence state="not_applicable" label="Not included" />
      </MeterLabelRow>
    );
  }

  return (
    <Stack gap="tight">
      <RungMeter
        label={label}
        value={consumed}
        max={allowance}
        valueLabel={`${formatCount(consumed)} of ${formatCount(allowance)} ${unit}`}
        warnAt={USAGE_METER_WARNING_RATIO}
        criticalAt={USAGE_METER_CRITICAL_RATIO}
      />
      <MeterLabelRow>
        <span className="type-caption">
          <InlineFigure>{formatCount(remaining)}</InlineFigure> remaining
          {item.reserved ? (
            <>
              {' · '}
              <InlineFigure>{formatCount(item.reserved)}</InlineFigure> reserved
            </>
          ) : null}
        </span>
        <ExpiryLine item={item} unit={unit} />
      </MeterLabelRow>
    </Stack>
  );
}

/**
 * Reset and expiry copy. Consumable balances forfeit at expiry, so that has to
 * be visible next to the balance rather than only at purchase.
 */
function ExpiryLine({ item, unit }: Readonly<{ item: UsageItem; unit: string }>) {
  if (item.resets_at) {
    return (
      <p className="type-caption">
        Resets <DisplayTime value={item.resets_at} dateOnly />.
      </p>
    );
  }
  if (!item.earliest_expiry) return null;
  // Only a consumable balance is forfeited; a slot allowance simply ends.
  return (
    <p className="type-caption">
      {item.capability_type === 'counter.consumable' ? `Unused ${unit} expire` : 'Ends'}{' '}
      <DisplayTime value={item.earliest_expiry} dateOnly />.
    </p>
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
export function usageLabel(item: UsageItem) {
  const known = USAGE_LABELS[item.key];
  if (known) return known;
  const words = item.key.replaceAll('_', ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), unit: item.unit };
}
