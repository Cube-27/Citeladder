import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { trafficLegSchema, aiTrafficUrlSchema } from '@citeladder/contracts/ai-traffic';
import { Drawer } from '@/components/ui/drawer';
import { PanelRightOpen } from 'lucide-react';
import { Absence } from '@/components/ui/absence';
import { Pressable } from '@/components/ui/pressable';
import { formatCount, formatWindowDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextLink } from '@/components/ui/text-link';
import { Stack } from '@/components/ui/layout';
import { Tooltip } from '@/components/ui/tooltip';
import { UrlText } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { DisplayTime } from '@/components/ui/display-time';
import { aiTrafficQueries, type TrafficFilters } from '@/lib/api/ai-traffic';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { projectDestination } from '@/lib/navigation/project-destination';
import { aiSourceLabel } from '@/lib/ai-traffic/series';
import { coverageLabel, legStateLabel, reasonLabel, words } from '@/lib/ai-traffic/vocabulary';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';
import { FactList } from '@/components/ui/facts';

type Leg = z.infer<typeof trafficLegSchema>;
type UrlEvidenceData = z.infer<typeof aiTrafficUrlSchema>;

/**
 * A leg in a table cell: its count, or its absence word with why in the
 * tooltip. Partial coverage is the row's Coverage mark, not part of the count.
 */
export function TrafficLeg({ leg, unit }: Readonly<{ leg: Leg; unit: string }>) {
  const detail = trafficLegExplanation(leg, unit);
  if (leg.value === null) return <LegAbsence leg={leg} reason={detail} />;
  const qualified =
    !['value', 'zero'].includes(leg.state) ||
    Boolean(leg.reason) ||
    Boolean(leg.coverage && leg.coverage !== 'complete');
  return qualified ? (
    <Tooltip content={detail}>
      <Pressable
        type="button"
        className="w-auto text-right tabular-nums"
        aria-label={`${formatCount(leg.value)} ${unit}`}
      >
        {formatCount(leg.value)}
      </Pressable>
    </Tooltip>
  ) : (
    formatCount(leg.value)
  );
}
/** A leg with no value, as the absence it is; an unknown leg keeps its own word. */
function LegAbsence({ leg, reason }: Readonly<{ leg: Pick<Leg, 'state'>; reason?: string }>) {
  if (leg.state === 'not_connected') return <Absence state="not_connected" reason={reason} />;
  return (
    <Absence
      state="unavailable"
      label={leg.state === 'unknown' ? 'Unknown' : undefined}
      reason={reason}
    />
  );
}
export function UrlPanel({
  urlHash,
  onClose,
  filters = {},
  fromRow = false,
}: Readonly<{
  urlHash: string | null;
  onClose: () => void;
  filters?: TrafficFilters;
  /** Opened from a Pages row, which already shows each count: the drawer leaves them out. */
  fromRow?: boolean;
}>) {
  const { workspaceId, projectId } = useProjectScope();
  const query = useQuery(aiTrafficQueries.url({ workspaceId, projectId }, urlHash, filters));
  const catalog = useQuery({
    ...aiTrafficQueries.catalog({ workspaceId, projectId }),
    enabled: !!urlHash,
  });
  const botLabel = (botId: string) =>
    catalog.data?.bots.find((bot) => bot.bot_id === botId)?.label ?? words(botId);
  const data = query.isError ? undefined : query.data,
    page = data?.page;
  return (
    <Drawer
      open={!!urlHash}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={page ? <UrlText url={page.display_path} /> : 'Path-level AI traffic'}
    >
      {query.isLoading ? (
        <StateBlock
          kind="loading"
          label="Loading URL evidence…"
          shape={{ kind: 'facts', rows: 5 }}
        />
      ) : null}
      {query.isError ? (
        <StateBlock
          kind="error"
          error={query.error}
          title="Couldn't load this page's AI traffic"
          fallback={READ_FAILED}
          onRetry={() => query.refetch()}
        />
      ) : null}
      {data ? (
        <UrlEvidence data={data} projectId={projectId} botLabel={botLabel} fromRow={fromRow} />
      ) : null}
    </Drawer>
  );
}

/** One metric of the page record: its name, its value or absence, and a link to its source. */
type MetricRow = Readonly<{
  name: string;
  value: ReactNode;
  /** Qualifies a value (its coverage); never shown beside an absence. */
  note?: string | null;
  link?: Readonly<{ label: string; to: string }>;
}>;

/** A leg's row value: its count with its state and coverage note, or its one absence word. */
function legRow(leg: Leg): Pick<MetricRow, 'value' | 'note'> {
  if (leg.value === null) return { value: <LegAbsence leg={leg} /> };
  const notes = new Set(
    [
      leg.state === 'value' || leg.state === 'zero' ? null : legStateLabel(leg.state),
      leg.coverage && leg.coverage !== 'complete' ? coverageLabel(leg.coverage) : null,
      leg.reason ? reasonLabel(leg.reason) : null,
    ].filter((note) => note !== null),
  );
  return { value: formatCount(leg.value), note: notes.size ? [...notes].join(' · ') : null };
}

function UrlEvidence({
  data,
  projectId,
  botLabel,
  fromRow,
}: Readonly<{
  data: UrlEvidenceData;
  projectId: string;
  botLabel: (botId: string) => string;
  fromRow: boolean;
}>) {
  const page = data.page;
  if (!page)
    return <StateBlock kind="empty" inline message="No evidence for this path in this window." />;
  const tab = (name: string) =>
    projectDestination('/ai-traffic', new URLSearchParams({ tab: name }), projectId);
  const website = projectDestination('/site', null, projectId);
  const rows: readonly MetricRow[] = [
    {
      name: 'Crawler requests',
      ...legRow(page.crawl),
      link: { label: 'Crawlers', to: tab('crawlers') },
    },
    {
      name: 'AI referral sessions',
      ...legRow(page.referrals),
      link: { label: 'Referrals', to: tab('referrals') },
    },
    {
      name: 'Key events (GA4)',
      // Key events come from the referral sessions' GA4 rows, so they share its connection and quality.
      ...legRow({ ...page.referrals, value: page.key_events }),
    },
    {
      name: 'Tracked citations',
      ...legRow(page.citations),
      link: { label: 'Visibility', to: projectDestination('/visibility', null, projectId) },
    },
    {
      name: 'Open Site health findings',
      ...legRow(page.findings),
      link: { label: 'Site health', to: website },
    },
  ];
  return (
    <Stack gap="workspace">
      <p className={textRole('caption')}>
        {formatWindowDate(data.window_start)} – {formatWindowDate(data.window_end)} · Path-level
        identity
      </p>
      {fromRow ? (
        <p className={textRole('caption')}>
          Sources:{' '}
          {rows.flatMap((row, index) =>
            row.link
              ? [
                  index ? ' · ' : null,
                  <PanelLink key={row.name} to={row.link.to}>
                    {row.link.label}
                  </PanelLink>,
                ]
              : [],
          )}
        </p>
      ) : null}
      <FactList
        layout="record"
        label="Page record"
        facts={[
          ...(fromRow ? [] : rows).map((row) => ({
            key: row.name,
            label: row.name,
            value: row.value,
            note: row.note,
            end: row.link ? <PanelLink to={row.link.to}>{row.link.label}</PanelLink> : null,
          })),
          {
            label: 'First and last observations',
            value: <Observations data={data} botLabel={botLabel} />,
          },
        ]}
      />
      <p className={textRole('caption')}>
        {data.provenance.bounded ? 'Timeline reached its display bound. ' : null}
        {data.provenance.crawl_id ? (
          <PanelLink to={website}>View Site health pages</PanelLink>
        ) : (
          'Inventory unavailable'
        )}
      </p>
    </Stack>
  );
}

/** The window's first and last observations per crawler, AI source and citation. */
function Observations({
  data,
  botLabel,
}: Readonly<{ data: UrlEvidenceData; botLabel: (botId: string) => string }>) {
  if (!data.crawls.length && !data.referrals.length && !data.citations.length)
    return <Absence state="none" />;
  return (
    <span className="flex flex-col">
      {data.crawls.map((r) => (
        <span key={r.bot_id}>
          {botLabel(r.bot_id)}: {formatCount(r.requests)} requests ·{' '}
          <DisplayTime value={r.first_seen} /> – <DisplayTime value={r.last_seen} />
        </span>
      ))}
      {data.referrals.map((r) => (
        <span key={r.ai_source}>
          {aiSourceLabel(r.ai_source)}: first referral {formatWindowDate(r.first_referral)} ·{' '}
          {formatCount(r.sessions)} sessions
        </span>
      ))}
      {data.citations.map((r) => (
        <span key={r.citation_id}>Tracked citation: {formatWindowDate(r.date)}</span>
      ))}
    </span>
  );
}

/** A link out of the drawer: the one Link look, on a route already scoped to the project. */
function PanelLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  return (
    <TextLink asChild text="inherit">
      <Link to={to}>{children}</Link>
    </TextLink>
  );
}
export function TrafficUrlButton({
  urlHash,
  filters = {},
  label,
  children = 'View AI traffic',
}: Readonly<{
  urlHash: string;
  filters?: TrafficFilters;
  /** An accessible name when the visible text alone does not identify the page. */
  label?: string;
  children?: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="quiet"
        onClick={() => setOpen(true)}
        aria-label={label}
        className="max-w-full"
      >
        <Icon icon={PanelRightOpen} />
        {children}
      </Button>
      <UrlPanel urlHash={open ? urlHash : null} onClose={() => setOpen(false)} filters={filters} />
    </>
  );
}
export function trafficLegExplanation(leg: z.infer<typeof trafficLegSchema>, unit: string) {
  return [
    `${unit}: ${legStateLabel(leg.state)}`,
    leg.coverage && coverageLabel(leg.coverage),
    leg.reason && reasonLabel(leg.reason),
  ]
    .filter(Boolean)
    .join(' · ');
}
