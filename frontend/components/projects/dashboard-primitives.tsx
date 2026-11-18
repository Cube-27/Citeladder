import { AppGrid } from '@/components/ui/app-grid';
import { ChartFrame } from '@/components/ui/chart-frame';
import { ClampText } from '@/components/ui/clamp-text';
import { StatusMark } from '@/components/ui/status-mark';
import { Delta } from '@/components/ui/delta';
import { Inline, Stack } from '@/components/ui/layout';
import { MeterRow } from '@/components/ui/meter';
import type { ReorderItem } from '@/components/ui/reorder-list';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import type { CommandCenter, Opportunity } from '@citeladder/contracts';
import { pluralCount, readableUrl } from '@/lib/format';
import { useEngineCatalog } from '@/lib/providers/engines';
import { formatRate } from '@/lib/visibility/dashboard';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import { textRole } from '@/components/ui/typography';

/**
 * A change against the previous comparable run, as every Command Center delta
 * reads it. The basis is spoken, not shown: beside the figure it cut the cards.
 */
export const VS_PREVIOUS_RUN = {
  spokenContext: 'compared with the previous run',
  missingReason: 'No comparable run',
} as const;

/**
 * The Command Center's rates arrive already in percent (0–100). They print
 * with AI Visibility's one decimal (`formatRate`), so one run never reads
 * 31.3% here and 31% there; a rank prints as AI Visibility prints it
 * (`formatRank`, "#3").
 */
export const percentFigure = (value: number | null) =>
  formatRate(value === null ? null : value / 100);

/**
 * Each engine's brand mention rate in the previous and the current comparable
 * run. Both are shares of answers on the same 0–100 scale, so they are drawn as
 * meters against that scale rather than against the largest bar on screen. The
 * caller owns the empty case.
 */
export function MovementChart({ movements }: Readonly<{ movements: CommandCenter['movements'] }>) {
  const engines = useEngineCatalog();
  const summary = movements
    .map(
      (row) =>
        `${engines.label(row.label)}: ${row.previous === null ? 'not measured' : percentFigure(row.previous)} to ${row.current === null ? 'not measured' : percentFigure(row.current)}`,
    )
    .join('; ');
  return (
    <ChartFrame summary={`Mention rate by engine, previous to current run. ${summary}.`}>
      <AppGrid layout="halves">
        {movements.map((row) => (
          // Unpacked grid rows stretch, so a taller card spreads each engine's rows.
          <Stack key={row.label} gap="compact" className="min-w-0">
            <Inline className="justify-between">
              <span className={textRole('label')}>{engines.label(row.label)}</span>
              <Delta value={row.delta} unit=" pp" {...VS_PREVIOUS_RUN} />
            </Inline>
            <MovementMeter
              engine={engines.label(row.label)}
              period="Previous"
              value={row.previous}
              tone="neutral"
            />
            <MovementMeter
              engine={engines.label(row.label)}
              period="Current"
              value={row.current}
              tone="accent"
            />
          </Stack>
        ))}
      </AppGrid>
    </ChartFrame>
  );
}

function MovementMeter({
  engine,
  period,
  value,
  tone,
}: Readonly<{
  engine: string;
  period: 'Previous' | 'Current';
  value: number | null;
  tone: 'neutral' | 'accent';
}>) {
  return (
    <MeterRow
      name={period}
      figure={value === null ? <Absence /> : percentFigure(value)}
      value={value}
      label={`${engine} ${period.toLowerCase()} mention rate`}
      tone={tone}
    />
  );
}

/**
 * The facts under an Action wherever the Overview lists it: its priority, its
 * target and how much evidence backs it, worded once.
 */
export function ActionFacts({ action }: Readonly<{ action: Opportunity }>) {
  return (
    <Inline>
      {/* The one priority mapping the evidence drawer uses. */}
      <StatusMark variant="priority" value={severityPriority(action.severity)}>
        {severityLabel(action.severity)}
      </StatusMark>
      <ClampText className={textRole('caption', 'min-w-0 flex-1')}>
        {`${action.target_label ? readableUrl(action.target_label) : 'Project-wide'} · ${pluralCount(action.evidence_summary.count, 'evidence item')}`}
      </ClampText>
    </Inline>
  );
}

/** One ranked action, as a row of the shared reorderable list. */
export function actionItem(action: Opportunity): ReorderItem {
  return {
    key: action.id,
    name: action.title,
    // The severity mark carries the priority; the score is not repeated.
    content: (
      <Stack gap="tight">
        {/* The Action's own title, from its source; cut to one line with all of it in the tooltip. */}
        <TextLink
          text="body"
          underline="hover"
          className="flex min-w-0"
          href={action.action_id ? `/actions/${action.action_id}` : '/actions'}
        >
          <ClampText>{action.title}</ClampText>
        </TextLink>
        <ActionFacts action={action} />
      </Stack>
    ),
  };
}
