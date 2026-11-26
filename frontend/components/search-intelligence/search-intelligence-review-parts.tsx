import { estimateUsd, runEstimate } from './search-intelligence-format';
import { SEARCH_DATASET_KINDS } from '@citeladder/contracts/search-intelligence';
import {
  SEARCH_DATASET_LABELS,
  searchMarketLabel,
  searchMarketOptions,
  searchScopeLabel,
} from '@/lib/config/search-intelligence';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Disclosure } from '@/components/ui/disclosure';
import { Field } from '@/components/ui/field';
import { FigureStrip } from '@/components/ui/figure-strip';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { TabPanel, TabRail, TabsRoot } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { formatCount, formattedText, pluralCount } from '@/lib/format';
import { isRecord } from '@/lib/utils';
import type { SearchDatasetSelectionRequest } from '@citeladder/contracts/search-intelligence-requests';
import type {
  ResearchScope,
  SearchIntelligenceReadiness,
  SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';
import { useMemo, useState } from 'react';
import {
  availableSelections,
  historyScopeConflict,
  selectionKey,
} from './search-intelligence-review-selection';
import { Notice } from '@/components/ui/notice';

export type Advanced = {
  researchScope: ResearchScope;
  ownedTarget: string;
  language: string;
  rankingOrder: SearchDatasetSelectionRequest['order'];
  acquisitionVolume: string;
  grouping: 'as_is' | 'one_per_domain';
  reuse: boolean;
  saveDefaults: boolean;
};

export function marketOptions(location: string, markets: SearchIntelligenceReadiness['markets']) {
  const options = searchMarketOptions(markets);
  return location && !options.some((item) => item.value === location)
    ? [...options, { value: location, label: searchMarketLabel(Number(location), markets) }]
    : options;
}

type DatasetPicks = Readonly<{
  isSelected: (option: SearchDatasetSelectionRequest) => boolean;
  onToggle: (option: SearchDatasetSelectionRequest) => void;
  depthOf: (option: SearchDatasetSelectionRequest) => string;
  onDepth: (option: SearchDatasetSelectionRequest, text: string) => void;
}>;

const OWNED = 'owned';

export function DatasetChoices({
  readiness,
  ...picks
}: DatasetPicks & Readonly<{ readiness: SearchIntelligenceReadiness }>) {
  const targets = useMemo(() => {
    const groups = new Map<string, SearchDatasetSelectionRequest[]>();
    for (const selection of availableSelections(readiness)) {
      const key = selection.competitor_id ?? OWNED;
      groups.set(key, [...(groups.get(key) ?? []), selection]);
    }
    return [...groups.entries()].map(([value, options]) => ({
      value,
      options,
      label:
        value === OWNED
          ? 'Your website'
          : (readiness.competitors.find((item) => item.identity === value)?.label ?? 'Competitor'),
    }));
  }, [readiness]);
  const [current, setCurrent] = useState(OWNED);
  const items = targets.map(({ value, label, options }) => ({
    value,
    label,
    count: options.filter(picks.isSelected).length,
  }));
  return (
    <TabsRoot value={current} onValueChange={setCurrent} orientation="vertical">
      <div className="desktop:grid-cols-[11rem_minmax(0,1fr)] grid min-w-0 gap-[var(--card-padding)]">
        <div className="desktop:block hidden min-w-0">
          <TabRail items={items} ariaLabel="Datasets for" />
        </div>
        <div className="desktop:hidden min-w-0">
          <Select
            ariaLabel="Datasets for"
            value={current}
            onValueChange={setCurrent}
            options={items.map((item) => ({
              value: item.value,
              label: `${item.label} (${formatCount(item.count)})`,
            }))}
          />
        </div>
        {targets.map(({ value, options }) => (
          <TabPanel key={value} value={value}>
            <DatasetRows options={options} {...picks} />
          </TabPanel>
        ))}
      </div>
    </TabsRoot>
  );
}

function DatasetRows({
  options,
  isSelected,
  onToggle,
  depthOf,
  onDepth,
}: DatasetPicks & Readonly<{ options: SearchDatasetSelectionRequest[] }>) {
  return (
    <Stack gap="compact">
      {options.map((option) => {
        const checked = isSelected(option);
        const label = SEARCH_DATASET_LABELS[option.kind] ?? option.kind;
        return (
          <Stack
            key={selectionKey(option)}
            gap="compact"
            className="grid-cols-[minmax(0,1fr)_6rem] items-center"
          >
            <Checkbox checked={checked} onCheckedChange={() => onToggle(option)} label={label} />
            {SEARCH_DATASET_KINDS[option.kind].fixedDepth ? null : (
              <Input
                aria-label={`${label}: number of results`}
                disabled={!checked}
                inputMode="numeric"
                value={depthOf(option)}
                onChange={(event) => onDepth(option, event.target.value)}
              />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

export function AdvancedOptions({
  targets,
  values,
  set,
}: Readonly<{
  targets: SearchIntelligenceReadiness['owned_targets'];
  values: Advanced;
  set: { [K in keyof Advanced]: (value: Advanced[K]) => void };
}>) {
  return (
    <Disclosure title="Advanced options">
      <Field label="Research scope">
        {(field) => (
          <Select
            {...field}
            ariaLabel="Research scope"
            value={values.researchScope}
            onValueChange={set.researchScope}
            options={[
              { value: 'domain_subdomains', label: 'Domain + subdomains' },
              { value: 'exact_host', label: 'Exact host' },
            ]}
          />
        )}
      </Field>
      {targets.length > 1 ? (
        <Field label="Website">
          {(field) => (
            <Select
              {...field}
              ariaLabel="Website"
              value={values.ownedTarget}
              onValueChange={set.ownedTarget}
              options={targets.map((target) => ({ value: target.identity, label: target.label }))}
            />
          )}
        </Field>
      ) : null}
      <Field label="Keyword language" hint="e.g. en, de">
        {(field) => (
          <Input
            {...field}
            value={values.language}
            onChange={(event) => set.language(event.target.value)}
          />
        )}
      </Field>
      <Field label="Keyword order">
        {(field) => (
          <Select
            {...field}
            ariaLabel="Keyword order"
            value={values.rankingOrder}
            onValueChange={set.rankingOrder}
            options={[
              { value: 'volume', label: 'Highest search volume' },
              { value: 'traffic', label: 'Most estimated traffic' },
              { value: 'position', label: 'Best position' },
              { value: 'difficulty', label: 'Lowest difficulty' },
              { value: 'cpc', label: 'Highest cost per click' },
            ]}
          />
        )}
      </Field>
      <Field label="Minimum search volume">
        {(field) => (
          <Input
            {...field}
            type="number"
            min={0}
            step={1}
            value={values.acquisitionVolume}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '' || (Number.isInteger(Number(value)) && Number(value) >= 0))
                set.acquisitionVolume(value);
            }}
          />
        )}
      </Field>
      <Field label="Backlink grouping">
        {(field) => (
          <Select
            {...field}
            ariaLabel="Backlink grouping"
            value={values.grouping}
            onValueChange={set.grouping}
            options={[
              { value: 'as_is', label: 'Every backlink' },
              { value: 'one_per_domain', label: 'One backlink per linking domain' },
            ]}
          />
        )}
      </Field>
      <Checkbox
        checked={values.reuse}
        onCheckedChange={(checked) => set.reuse(checked === true)}
        label="Reuse results saved in the last 30 days instead of fetching them again"
      />
      <Checkbox
        checked={values.saveDefaults}
        onCheckedChange={(checked) => set.saveDefaults(checked === true)}
        label="Remember these choices for this project"
      />
    </Disclosure>
  );
}

export function ReviewFooter({
  review,
  selected,
  canReview,
  busy,
  onBack,
  onReview,
  onConfirm,
}: Readonly<{
  review: SearchIntelligenceRun | null;
  selected: number;
  canReview: boolean;
  busy: boolean;
  onBack: () => void;
  onReview: () => void;
  onConfirm: () => void;
}>) {
  if (review)
    return (
      <Inline className="justify-end">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" pending={busy} pendingLabel="Starting…" onClick={onConfirm}>
          Confirm {formattedText(runEstimate(review))} analysis
        </Button>
      </Inline>
    );
  return (
    <Inline gap="compact" className="justify-between">
      <span className={textRole('caption')}>{pluralCount(selected, 'dataset')} selected</span>
      <Button
        variant="primary"
        disabled={!canReview}
        pending={busy}
        pendingLabel="Estimating…"
        onClick={onReview}
      >
        Review AI credits
      </Button>
    </Inline>
  );
}

export function HistoryScopeNotice({
  scope,
  selections,
}: Readonly<{ scope: ResearchScope; selections: SearchDatasetSelectionRequest[] }>) {
  if (!historyScopeConflict(selections, scope)) return null;
  return (
    <Notice tone="negative">
      Backlink history covers the whole domain. Deselect it or set the research scope to Domain +
      subdomains.
    </Notice>
  );
}

function hostOf(target: unknown): string {
  const origin = isRecord(target) ? target.origin : '';
  try {
    return new URL(String(origin)).hostname;
  } catch {
    return '';
  }
}

export function ReviewSummary({ review }: Readonly<{ review: SearchIntelligenceRun }>) {
  const scope = review.frozen_scope.research_scope;
  return (
    <>
      <Section>
        <SectionHeader>
          <SectionTitle level={3}>What will be fetched</SectionTitle>
        </SectionHeader>
        <FigureStrip
          segments={[
            { key: 'requests', label: 'Requests', value: formatCount(review.planned_calls) },
            { key: 'results', label: 'Results, at most', value: formatCount(review.planned_rows) },
            {
              key: 'estimate',
              label: review.credential_mode === 'funded' ? 'AI credits' : 'DataForSEO estimate',
              value: runEstimate(review),
            },
          ]}
        />
        <p className={textRole('body', 'text-ink-2')}>
          Scope: {searchScopeLabel(typeof scope === 'string' ? scope : undefined)}
        </p>
        <p className={textRole('caption')}>
          {review.credential_mode === 'funded'
            ? 'Held from your AI credits; only successful requests are charged, never above the estimate.'
            : 'Billed to your DataForSEO account.'}
        </p>
      </Section>
      {review.call_plan.length ? (
        <Section>
          <SectionHeader>
            <SectionTitle level={3}>Requests</SectionTitle>
          </SectionHeader>
          <SectionBleed as="ul" rows>
            {review.call_plan.map((call) => {
              const target = hostOf(call.target),
                comparison = hostOf(call.comparison);
              return (
                <Inline
                  as="li"
                  gap="compact"
                  className="type-body text-ink-2 justify-between"
                  key={`${String(call.dataset_key)}:${String(call.page)}`}
                >
                  <span>
                    {SEARCH_DATASET_LABELS[String(call.dataset_kind)] ?? String(call.dataset_kind)}
                    {target ? ` · ${target}` : ''}
                    {comparison ? ` vs ${comparison}` : ''}
                  </span>
                  {call.estimated_cost_usd === undefined ? null : (
                    <span className="text-ink-2">
                      ${estimateUsd(String(call.estimated_cost_usd))}
                    </span>
                  )}
                </Inline>
              );
            })}
          </SectionBleed>
        </Section>
      ) : null}
      {review.reused_datasets.length ? (
        <p className="type-body text-ink-2">
          {pluralCount(review.reused_datasets.length, 'recent result')} will be reused without AI
          credits.
        </p>
      ) : null}
    </>
  );
}
