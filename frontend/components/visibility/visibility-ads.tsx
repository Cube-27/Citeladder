import type { VisibilityAdsResponse } from '@citeladder/contracts/visibility-ads';
import { Megaphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { Inline, Stack } from '@/components/ui/layout';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import {
  availabilityLabel,
  formatDisplayShortDate,
  formatPercent,
  measured,
  pluralCount,
} from '@/lib/format';
import {
  AD_APPLICABILITY,
  ADS_COVERAGE_NOTE,
  adsStateCopy,
  landingLabel,
  presenceLine,
} from '@/lib/visibility/ads';
import { useEngineCatalog } from '@/lib/providers/engines';
import { mergedAdPages, useAds } from '@/lib/visibility/use-ads';
import { AdOwnershipChip } from '@/components/visibility/ad-ownership-chip';
import type { SourceFilters } from '@/components/visibility/source-rows';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';
import { AnalysisRead } from '@/components/visibility/selection-gate';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionContent, TitledSection, SectionStack } from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';

/**
 * Paid ads shown in ChatGPT Search answers. Ads are reported apart from
 * sources and citations; an engine without ads is not applicable, never zero.
 */
export function VisibilityAds({
  filters,
  queries,
}: Readonly<{ filters: SourceFilters; queries: SourceQueries }>) {
  const query = useAds(filters, queries);
  const [firstPage, ...laterPages] = query.data?.pages ?? [];
  return (
    <AnalysisRead
      query={query}
      title="Couldn't load the ads"
      busyLabel="Updating ads"
      busy={query.isFetching && !query.isFetchingNextPage}
      ready={firstPage}
    >
      {(page) => (
        <AdsView
          data={mergedAdPages([page, ...laterPages])}
          onShowMore={query.hasNextPage ? () => void query.fetchNextPage() : undefined}
          loadingMore={query.isFetchingNextPage}
        />
      )}
    </AnalysisRead>
  );
}

export function AdsView({
  data,
  onShowMore,
  loadingMore = false,
}: Readonly<{ data: VisibilityAdsResponse; onShowMore?: () => void; loadingMore?: boolean }>) {
  if (data.state !== 'value') return <AdsState state={data.state} engines={data.engines} />;
  return (
    <SectionStack>
      <Headline data={data} />
      <AdvertiserTable advertisers={data.advertisers} total={data.advertisers_seen} />
      <PromptTable prompts={data.prompts} />
      <CreativeList creatives={data.creatives} onShowMore={onShowMore} loadingMore={loadingMore} />
    </SectionStack>
  );
}

function CoverageNote() {
  return <p className={textRole('caption', 'text-ink-2')}>{ADS_COVERAGE_NOTE}</p>;
}

/** A read with no ads to show, with each engine's applicability named. */
function AdsState({
  state,
  engines = [],
}: Readonly<{
  state: Exclude<VisibilityAdsResponse['state'], 'value'>;
  engines?: VisibilityAdsResponse['engines'];
}>) {
  const copy = adsStateCopy(state);
  const { label: engineLabel } = useEngineCatalog();
  // One state box at the shared footprint: each engine's applicability is
  // part of the same sentence, not a footer that grows the box.
  const applicability = engines
    .map((engine) => `${engineLabel(engine.engine)}: ${AD_APPLICABILITY[engine.applicability]}`)
    .join(' · ');
  return (
    <StateBlock
      kind="empty"
      headingLevel={3}
      icon={Megaphone}
      heading={copy.heading}
      description={applicability ? `${copy.description} ${applicability}.` : copy.description}
    />
  );
}

function EngineApplicability({ engines }: Readonly<{ engines: VisibilityAdsResponse['engines'] }>) {
  const { label: engineLabel } = useEngineCatalog();
  if (!engines.length) return null;
  return (
    <Inline as="ul" gap="meta" className={textRole('caption', 'text-ink-2')}>
      {engines.map((engine) => (
        <li key={engine.engine}>
          {engineLabel(engine.engine)}: {AD_APPLICABILITY[engine.applicability]}
        </li>
      ))}
    </Inline>
  );
}

function Headline({ data }: Readonly<{ data: VisibilityAdsResponse }>) {
  return (
    <Section>
      <SectionContent>
        <Stack gap="item">
          <FigureStrip
            label="Ads in ChatGPT answers"
            segments={[
              {
                key: 'presence',
                label: 'Ad presence',
                value: measured(formatPercent(data.presence.rate)),
                missingLabel: availabilityLabel('unavailable'),
                sub: presenceLine(data.presence),
              },
              {
                key: 'brand',
                label: 'Your ad share',
                value: measured(formatPercent(data.brand.share)),
                missingLabel: 'Not advertising',
                sub:
                  data.brand.best_rank === null
                    ? 'No ads of yours were seen.'
                    : `${data.brand.appearances} of your ads; best position ${data.brand.best_rank}`,
              },
              {
                key: 'advertisers',
                label: 'Advertisers seen',
                value: data.advertisers_seen,
                sub: 'Distinct advertiser domains in these answers.',
              },
            ]}
          />
          <EngineApplicability engines={data.engines} />
          <CoverageNote />
        </Stack>
      </SectionContent>
    </Section>
  );
}

function AdvertiserTable({
  advertisers,
  total,
}: Readonly<{ advertisers: VisibilityAdsResponse['advertisers']; total: number }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <TitledSection title="Advertisers">
      <DataTable
        label="Advertisers"
        columns={ADVERTISER_COLUMNS}
        footer={
          advertisers.length < total
            ? `The ${advertisers.length} most frequent of ${total} advertisers.`
            : 'Who paid to appear in these answers.'
        }
        state={advertisers.length ? undefined : noAds('No ads in these answers.')}
      >
        {advertisers.map((advertiser) => (
          <TableRow key={advertiser.domain}>
            <TableCell>
              <span className="grid min-w-0">
                <Inline as="span">
                  <ClampText lines={1}>{advertiser.name}</ClampText>
                  <AdOwnershipChip ownership={advertiser.ownership} />
                </Inline>
                <ClampText lines={1} className={textRole('caption', 'text-ink-2')}>
                  {advertiser.domain}
                </ClampText>
              </span>
            </TableCell>
            <TableCell numeric>{advertiser.appearances}</TableCell>
            <TableCell numeric>{advertiser.prompts}</TableCell>
            <TableCell numeric>{formatPercent(advertiser.share)}</TableCell>
            <TableCell>
              {formatDisplayShortDate(advertiser.first_seen_at, timeZone)} –{' '}
              {formatDisplayShortDate(advertiser.last_seen_at, timeZone)}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const ADVERTISER_COLUMNS: readonly DataTableColumn[] = [
  { key: 'advertiser', label: 'Advertiser' },
  { key: 'appearances', label: 'Appearances', width: 'figure', kind: 'number' },
  { key: 'prompts', label: 'Prompts', width: 'figure', kind: 'number' },
  { key: 'share', label: 'Share', width: 'figure', kind: 'number' },
  // A date range is text, aligned like every other date column.
  { key: 'seen', label: 'Seen', width: 'date' },
];

const PROMPT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'prompt', label: 'Prompt' },
  { key: 'ads', label: 'Ads seen', width: 'figure', kind: 'number' },
  { key: 'top', label: 'Top advertiser', width: 'status' },
  {
    key: 'beside',
    label: 'Mentioned you',
    width: 'category',
    hint: 'Of the answers that showed a competitor ad, how many also mentioned you organically.',
  },
];

function noAds(heading: string): DataTableState {
  return { kind: 'empty', headingLevel: 3, icon: Megaphone, heading };
}

function PromptTable({ prompts }: Readonly<{ prompts: VisibilityAdsResponse['prompts'] }>) {
  return (
    <TitledSection title="Prompts that surface ads">
      <DataTable
        label="Prompts that surface ads"
        columns={PROMPT_COLUMNS}
        footer="Where a competitor advertised, whether the answer also mentioned you organically. Counts only, not a cause."
        state={prompts.length ? undefined : noAds('No prompt surfaced an ad.')}
      >
        {prompts.map((row) => {
          const beside = row.competitor_ad_answers;
          const withCompetitorAd = beside.brand_mentioned + beside.brand_not_mentioned;
          return (
            <TableRow key={row.prompt}>
              <TableCell>{row.prompt}</TableCell>
              <TableCell numeric>{row.ads_seen}</TableCell>
              <TableCell>{row.top_advertiser?.name ?? <Absence />}</TableCell>
              <TableCell>
                {withCompetitorAd
                  ? `${beside.brand_mentioned} of ${withCompetitorAd} answers`
                  : 'No competitor ads'}
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </TitledSection>
  );
}

function CreativeList({
  creatives,
  onShowMore,
  loadingMore,
}: Readonly<{
  creatives: VisibilityAdsResponse['creatives'];
  onShowMore?: () => void;
  loadingMore: boolean;
}>) {
  return (
    <TitledSection
      title="Ad creatives"
      description={
        creatives.items.length < creatives.total
          ? `The ${creatives.items.length} most frequent of ${creatives.total} creatives, as text.`
          : 'The ads as text, with where they lead.'
      }
    >
      <SectionContent>
        <Stack>
          {!creatives.items.length ? (
            <StateBlock kind="empty" inline message="No ads in these answers." />
          ) : (
            <Stack as="ul">
              {creatives.items.map((creative) => (
                <Stack
                  as="li"
                  gap="tight"
                  key={`${creative.advertiser_domain}:${creative.title}:${creative.snippet}:${creative.landing_url}`}
                >
                  <Inline as="span" className="flex-wrap">
                    <span className={textRole('emphasis')}>{creative.title || 'Untitled ad'}</span>
                    <AdOwnershipChip ownership={creative.ownership} />
                  </Inline>
                  {creative.snippet ? (
                    <span className={textRole('body', 'text-ink-2')}>{creative.snippet}</span>
                  ) : null}
                  <ClampText className={textRole('caption', 'text-ink-2')}>
                    {creative.advertiser_name} · {landingLabel(creative.landing_url)} ·{' '}
                    {pluralCount(creative.appearances, 'appearance')}
                  </ClampText>
                </Stack>
              ))}
            </Stack>
          )}
          {onShowMore ? (
            <Button
              variant="secondary"
              className="justify-self-start"
              disabled={loadingMore}
              onClick={onShowMore}
            >
              Show more creatives
            </Button>
          ) : null}
        </Stack>
      </SectionContent>
    </TitledSection>
  );
}
