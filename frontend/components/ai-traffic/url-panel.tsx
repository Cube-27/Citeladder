import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { trafficLegSchema, aiTrafficUrlSchema } from '@citeladder/contracts/ai-traffic';
import { Drawer } from '@/components/ui/drawer';
import { PanelRightOpen } from 'lucide-react';
import { Absence } from '@/components/ui/absence';
import { Pressable } from '@/components/ui/pressable';
import { formatCount, type DataAvailabilityState } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextLink } from '@/components/ui/text-link';
import { Stack } from '@/components/ui/layout';
import { Tooltip } from '@/components/ui/tooltip';
import { DisplayTime } from '@/components/ui/display-time';
import { aiTrafficQueries, type TrafficFilters } from '@/lib/api/ai-traffic';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { projectDestination } from '@/lib/navigation/project-destination';
import { aiSourceLabel } from '@/lib/ai-traffic/series';
import { coverageLabel, legStateLabel, reasonLabel, words } from '@/lib/ai-traffic/vocabulary';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type Leg = z.infer<typeof trafficLegSchema>;

export function TrafficLeg({
  leg,
  unit,
  compact = false,
}: Readonly<{ leg: Leg; unit: string; compact?: boolean }>) {
  if (compact) return <CompactTrafficLeg leg={leg} unit={unit} />;
  return (
    <span>
      {leg.value === null ? <Absence state={legAbsence(leg)} /> : leg.value} {unit} ·{' '}
      {legStateLabel(leg.state)}
      {leg.coverage ? ' · ' + coverageLabel(leg.coverage) : ''}
      {leg.reason ? ' · ' + reasonLabel(leg.reason) : ''}
    </span>
  );
}
function CompactTrafficLeg({ leg, unit }: Readonly<{ leg: Leg; unit: string }>) {
  const detail = trafficLegExplanation(leg, unit);
  if (leg.value === null) return <Absence state={legAbsence(leg)} narrow reason={detail} />;
  const qualified =
    leg.value === null ||
    !['value', 'zero'].includes(leg.state) ||
    Boolean(leg.reason) ||
    Boolean(leg.coverage && leg.coverage !== 'complete');
  const value = (
    <>
      {formatCount(leg.value)}
      {leg.coverage === 'partial' ? <span className="type-caption block">Partial</span> : null}
    </>
  );
  return qualified ? (
    <Tooltip content={detail}>
      <Pressable
        type="button"
        className="w-auto text-center tabular-nums"
        aria-label={`${formatCount(leg.value)} ${unit}`}
      >
        {value}
      </Pressable>
    </Tooltip>
  ) : (
    <span className="tabular-nums">{value}</span>
  );
}
/** A leg with no value, as the absence it is. */
function legAbsence(leg: Leg): DataAvailabilityState {
  if (leg.state === 'not_connected') return 'not_connected';
  return leg.state === 'unknown' ? 'unknown' : 'unavailable';
}
export function UrlPanel({
  urlHash,
  onClose,
  filters = {},
}: Readonly<{ urlHash: string | null; onClose: () => void; filters?: TrafficFilters }>) {
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
      title={page?.display_path ?? 'Path-level AI Traffic'}
      description="Persisted observations; requests, sessions and citations are separate units."
    >
      {query.isLoading ? <StateBlock kind="loading" label="Loading URL evidence…" /> : null}
      {query.isError ? (
        <StateBlock
          kind="error"
          error={query.error}
          title="Couldn't load this page's AI Traffic"
          fallback="The request failed or timed out."
          onRetry={() => query.refetch()}
        />
      ) : null}
      {data ? <UrlEvidence data={data} projectId={projectId} botLabel={botLabel} /> : null}
    </Drawer>
  );
}
function UrlEvidence({
  data,
  projectId,
  botLabel,
}: Readonly<{
  data: z.infer<typeof aiTrafficUrlSchema>;
  projectId: string;
  botLabel: (botId: string) => string;
}>) {
  const page = data.page;
  if (!page)
    return (
      <Notice tone="info">
        No joinable evidence is available for this path in the selected window.
      </Notice>
    );
  const link = (tab: string) =>
    projectDestination('/ai-traffic', new URLSearchParams({ tab }), projectId);
  return (
    <Stack gap="workspace">
      <p className="type-caption">
        {data.window_start} – {data.window_end} · Path-level identity
      </p>
      <p>
        <TrafficLeg leg={page.crawl} unit="requests" />{' '}
        <PanelLink to={link('crawlers')}>Crawlers</PanelLink>
      </p>
      <p>
        <TrafficLeg leg={page.referrals} unit="AI referral sessions" />{' '}
        <PanelLink to={link('referrals')}>Referrals</PanelLink>
      </p>
      <p>
        {page.key_events === null ? <Absence state="unavailable" /> : formatCount(page.key_events)}{' '}
        key events as configured in GA4
      </p>
      <p>
        <TrafficLeg leg={page.citations} unit="tracked citations" />{' '}
        <PanelLink to={projectDestination('/visibility', null, projectId)}>Visibility</PanelLink>
      </p>
      <p>
        <TrafficLeg leg={page.findings} unit="open Website findings" />{' '}
        <PanelLink to={projectDestination('/site', null, projectId)}>Website</PanelLink>
      </p>
      <p className="type-caption">First and last observations in this window</p>
      {data.crawls.map((r) => (
        <p key={r.bot_id}>
          {botLabel(r.bot_id)}: {r.requests} requests · <DisplayTime value={r.first_seen} /> –{' '}
          <DisplayTime value={r.last_seen} />
        </p>
      ))}
      {data.referrals.map((r) => (
        <p key={r.ai_source}>
          {aiSourceLabel(r.ai_source)}: first referral {r.first_referral} · {r.sessions} sessions
        </p>
      ))}
      {data.citations.map((r) => (
        <p key={r.citation_id}>Tracked citation: {r.date}</p>
      ))}
      {data.provenance.bounded ? (
        <Notice tone="info">The timeline reached its display bound.</Notice>
      ) : null}
      <p className="type-caption">
        Timeline uses saved crawler rollups, GA4 metric rows and tracked citations.
        {data.provenance.crawl_id ? (
          <>
            {' '}
            <PanelLink to={projectDestination('/site', null, projectId)}>
              View Website pages
            </PanelLink>
          </>
        ) : (
          ' Inventory unavailable'
        )}
      </p>
    </Stack>
  );
}
/** A link out of the drawer: the one Link look, on a route already scoped to the project. */
function PanelLink({ to, children }: Readonly<{ to: string; children: React.ReactNode }>) {
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
  children = 'View AI Traffic',
}: Readonly<{
  urlHash: string;
  filters?: TrafficFilters;
  /** An accessible name when the visible text alone does not identify the page. */
  label?: string;
  children?: React.ReactNode;
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
