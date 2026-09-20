'use client';

import { useMemo, useState } from 'react';
import { estimateUsd } from './search-intelligence-format';
import {
  SEARCH_DEFAULT_DEPTHS,
  SEARCH_MAX_DEPTH,
  SEARCH_MARKET_OPTIONS,
  searchMarketLabel,
  searchScopeLabel,
} from '@/lib/config/search-intelligence';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { textRole } from '@/components/ui/typography';
import type {
  DatasetSelection,
  ReviewPayload,
  SearchIntelligenceReadiness,
  SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';
import { prepareReviewSelections } from './search-intelligence-review-selection';

const LABELS: Record<string, string> = {
  footprint: 'Keyword footprint',
  ranking_keywords: 'Ranked keywords',
  keyword_suggestions: 'Keyword suggestions',
  backlink_summary: 'Backlink summary',
  referring_domains: 'Referring domains',
  destination_pages: 'Destination pages',
  missing_keywords: 'Competitor missing keywords',
  shared_keywords: 'Competitor shared keywords',
  organic_pages: 'Organic top pages',
  backlinks: 'Individual backlinks',
  backlink_history: 'Backlink history (domain-level, past year)',
};

function availableSelections(data: SearchIntelligenceReadiness): DatasetSelection[] {
  const own = [
    'footprint',
    'ranking_keywords',
    'keyword_suggestions',
    'backlink_summary',
    'referring_domains',
    'destination_pages',
    'organic_pages',
    'backlinks',
    'backlink_history',
  ].map((kind) => ({
    kind,
    depth:
      data.preferences.depths[kind] ??
      SEARCH_DEFAULT_DEPTHS[kind as keyof typeof SEARCH_DEFAULT_DEPTHS],
  }));
  const competitorIds = data.preferences.competitor_ids.length
    ? data.preferences.competitor_ids
    : data.competitors.map(({ identity }) => identity);
  return [
    ...own,
    ...competitorIds.flatMap((competitor_id) =>
      [
        'footprint',
        'missing_keywords',
        'shared_keywords',
        'backlink_summary',
        'backlinks',
        'referring_domains',
        'destination_pages',
        'organic_pages',
        'backlink_history',
      ].map((kind) => ({
        kind,
        competitor_id,
        depth:
          data.preferences.depths[kind] ??
          SEARCH_DEFAULT_DEPTHS[kind as keyof typeof SEARCH_DEFAULT_DEPTHS],
      })),
    ),
  ];
}

function defaultSelections(data: SearchIntelligenceReadiness, action: string): DatasetSelection[] {
  const available = availableSelections(data);
  return action === 'seed'
    ? available.filter(
        ({ kind, competitor_id }) => kind === 'keyword_suggestions' && !competitor_id,
      )
    : available.filter(
        ({ kind, competitor_id }) =>
          kind !== 'keyword_suggestions' &&
          (!competitor_id || ['footprint', 'missing_keywords', 'shared_keywords'].includes(kind)),
      );
}

function reviewInputsValid(
  selections: DatasetSelection[],
  ownedTarget: string,
  location: string,
  seed: string,
  researchScope: string,
) {
  return Boolean(
    selections.length &&
    ownedTarget &&
    (selections.every(({ kind }) =>
      [
        'backlink_summary',
        'referring_domains',
        'destination_pages',
        'backlinks',
        'backlink_history',
      ].includes(kind),
    ) ||
      (Number.isInteger(Number(location)) && Number(location) > 0)) &&
    !(
      researchScope === 'exact_host' && selections.some(({ kind }) => kind === 'backlink_history')
    ) &&
    selections.every((item) => item.kind !== 'keyword_suggestions' || seed.trim()),
  );
}

function HistoryScopeNotice({
  scope,
  selections,
}: Readonly<{ scope: string; selections: DatasetSelection[] }>) {
  if (scope !== 'exact_host' || !selections.some(({ kind }) => kind === 'backlink_history'))
    return null;
  return (
    <Alert>
      Deselect history or choose Domain + subdomains. History cannot be filtered to an exact host.
    </Alert>
  );
}

function indirectLinkPolicy(scope: unknown) {
  return scope === 'domain_subdomains' ? 'included' : 'excluded';
}

export function SearchIntelligenceReviewDrawer({
  open,
  action,
  readiness,
  onOpenChange,
  onReview,
  onConfirm,
  busy,
}: Readonly<{
  open: boolean;
  action: string;
  readiness: SearchIntelligenceReadiness;
  onOpenChange: (open: boolean) => void;
  onReview: (payload: ReviewPayload) => Promise<SearchIntelligenceRun>;
  onConfirm: (runId: string) => Promise<void>;
  busy: boolean;
}>) {
  const [selections, setSelections] = useState<DatasetSelection[]>(() =>
    defaultSelections(readiness, action),
  );
  const [location, setLocation] = useState(String(readiness.preferences.location_code ?? ''));
  const [language, setLanguage] = useState(readiness.preferences.language_code || 'en');
  const [seed, setSeed] = useState('');
  const [researchScope, setResearchScope] = useState<'exact_host' | 'domain_subdomains'>(
    () => readiness.preferences.research_scope ?? 'domain_subdomains',
  );
  const [grouping, setGrouping] = useState<'as_is' | 'one_per_domain'>('as_is');
  const [rankingOrder, setRankingOrder] = useState<DatasetSelection['order']>('volume');
  const [acquisitionVolume, setAcquisitionVolume] = useState('');
  const [ownedTarget, setOwnedTarget] = useState(
    readiness.preferences.owned_target_id ?? readiness.owned_targets[0]?.identity ?? '',
  );
  const [reuse, setReuse] = useState(
    () => !['refresh', 'increase_depth'].includes(action) && readiness.preferences.reuse_recent,
  );
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [review, setReview] = useState<SearchIntelligenceRun | null>(null);
  const [error, setError] = useState('');
  const grouped = useMemo(() => {
    const groups = new Map<string, DatasetSelection[]>();
    for (const selection of availableSelections(readiness)) {
      const key = selection.competitor_id ?? 'owned';
      groups.set(key, [...(groups.get(key) ?? []), selection]);
    }
    return groups;
  }, [readiness]);
  const selectedKey = (candidate: DatasetSelection) =>
    `${candidate.kind}:${candidate.competitor_id ?? ''}`;
  const isSelected = (candidate: DatasetSelection) =>
    selections.some((item) => selectedKey(item) === selectedKey(candidate));
  const toggle = (candidate: DatasetSelection) =>
    setSelections((current) =>
      isSelected(candidate)
        ? current.filter((item) => selectedKey(item) !== selectedKey(candidate))
        : [...current, candidate],
    );
  const updateDepth = (candidate: DatasetSelection, depth: number) => {
    if (!Number.isInteger(depth) || depth < 1 || depth > SEARCH_MAX_DEPTH) return;
    setSelections((current) =>
      current.map((item) =>
        selectedKey(item) === selectedKey(candidate) ? { ...item, depth } : item,
      ),
    );
  };
  const canReview = reviewInputsValid(selections, ownedTarget, location, seed, researchScope);
  const submitReview = async () => {
    setError('');
    try {
      setReview(
        await onReview({
          action,
          research_scope: researchScope,
          owned_target_id: ownedTarget,
          location_code: location === '' ? null : Number(location),
          language_code: language,
          reuse_recent: reuse,
          save_as_defaults: saveDefaults,
          datasets: prepareReviewSelections(selections, {
            seed,
            grouping,
            order: rankingOrder,
            minVolume: acquisitionVolume,
          }),
          previous_run_id: action === 'analysis' ? null : (readiness.latest_run?.id ?? null),
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Acquisition could not be reviewed.');
    }
  };
  const confirmReview = async () => {
    if (!review) return;
    setError('');
    try {
      await onConfirm(review.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Acquisition could not be confirmed.');
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setReview(null);
          setError('');
        }
        onOpenChange(nextOpen);
      }}
      title="Review DataForSEO acquisition"
      description="No provider request is made until you confirm this frozen call plan."
      footer={
        review ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReview(null)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void confirmReview()}>
              Confirm ${estimateUsd(review.estimated_cost_usd)} acquisition
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button disabled={busy || !canReview} onClick={() => void submitReview()}>
              Review cost
            </Button>
          </div>
        )
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      {review ? (
        <Stack gap="workspace">
          <Stack as="section" gap="compact">
            <h3 className={textRole('objectTitle')}>Frozen scope</h3>
            <p>
              {searchScopeLabel(String(review.frozen_scope.research_scope))}. Indirect links are{' '}
              {indirectLinkPolicy(review.frozen_scope.research_scope)} from live backlink datasets.
              History is the provider’s monthly domain coverage, including its own link population.
            </p>
            <dl className="grid grid-cols-2 gap-[var(--compact-gap)] text-sm">
              <div>
                <dt className="text-muted">Provider calls</dt>
                <dd className="text-xl tabular-nums">{review.planned_calls}</dd>
              </div>
              <div>
                <dt className="text-muted">Maximum rows</dt>
                <dd className="text-xl tabular-nums">{review.planned_rows.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted">Estimated total</dt>
                <dd className="text-xl tabular-nums">${estimateUsd(review.estimated_cost_usd)}</dd>
              </div>
              <div>
                <dt className="text-muted">Pricing version</dt>
                <dd>{review.pricing_version}</dd>
              </div>
            </dl>
          </Stack>
          <Stack as="section" gap="compact">
            <h3 className={textRole('objectTitle')}>Charged call plan</h3>
            <ul className="grid gap-2 text-sm">
              {review.call_plan.map((call, index) => (
                <li
                  className="border-border-subtle rounded-[var(--radius-control)] border p-2"
                  key={`${String(call.dataset_key)}:${String(call.page)}`}
                >
                  <span>
                    {index + 1}. {String(call.dataset_kind).replaceAll('_', ' ')}
                  </span>
                  <span className="text-muted float-right">
                    ${estimateUsd(String(call.estimated_cost_usd))}
                  </span>
                  <details>
                    <summary>Targets, bounds and request details</summary>
                    <pre className="overflow-x-auto break-all whitespace-pre-wrap">
                      {JSON.stringify(
                        {
                          target: call.target,
                          comparison: call.comparison,
                          endpoint: call.endpoint,
                          request: call.request,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </Stack>
          {review.reused_datasets.length ? (
            <p className="text-muted text-sm">
              {review.reused_datasets.length} fresh dataset(s) will be reused without provider
              calls.
            </p>
          ) : null}
        </Stack>
      ) : (
        <Stack gap="workspace">
          <Select
            ariaLabel="Research scope"
            value={researchScope}
            onValueChange={(value) => setResearchScope(value as typeof researchScope)}
            options={[
              { value: 'domain_subdomains', label: 'Domain + subdomains' },
              { value: 'exact_host', label: 'Exact host' },
            ]}
          />
          <Select
            ariaLabel="Backlink grouping"
            value={grouping}
            onValueChange={(value) => setGrouping(value as typeof grouping)}
            options={[
              { value: 'as_is', label: 'All provider backlink rows' },
              { value: 'one_per_domain', label: 'One backlink per domain' },
            ]}
          />
          <Select
            ariaLabel="Ranking acquisition order"
            value={rankingOrder}
            onValueChange={(value) => setRankingOrder(value as DatasetSelection['order'])}
            options={['volume', 'traffic', 'position', 'difficulty', 'cpc'].map((value) => ({
              value,
              label: `Acquire by ${value}`,
            }))}
          />
          <HistoryScopeNotice scope={researchScope} selections={selections} />
          <Input
            aria-label="Minimum acquisition search volume"
            type="number"
            min={0}
            step={1}
            value={acquisitionVolume}
            placeholder="Minimum acquisition search volume"
            onChange={(event) => {
              const value = event.target.value;
              if (value === '' || (Number.isInteger(Number(value)) && Number(value) >= 0))
                setAcquisitionVolume(value);
            }}
          />
          <label htmlFor="search-owned-target" className="grid gap-1 text-sm">
            <span>Owned target</span>
            <Select
              id="search-owned-target"
              ariaLabel="Owned target"
              value={ownedTarget}
              onValueChange={setOwnedTarget}
              options={readiness.owned_targets.map((target) => ({
                value: target.identity,
                label: target.label,
              }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="search-location-code" className="grid gap-1 text-sm">
              <span>Market</span>
              <Select
                id="search-location-code"
                ariaLabel="Market"
                value={location}
                onValueChange={setLocation}
                placeholder="Select market"
                options={
                  location && !SEARCH_MARKET_OPTIONS.some((item) => item.value === location)
                    ? [
                        ...SEARCH_MARKET_OPTIONS,
                        { value: location, label: searchMarketLabel(Number(location)) },
                      ]
                    : SEARCH_MARKET_OPTIONS
                }
              />
            </label>
            <label htmlFor="search-language" className="grid gap-1 text-sm">
              <span>Language</span>
              <Input
                id="search-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              />
            </label>
          </div>
          <label htmlFor="search-keyword-seed" className="grid gap-1 text-sm">
            <span>Keyword suggestion seed</span>
            <Input
              id="search-keyword-seed"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="Required when keyword suggestions are selected"
            />
          </label>
          {[...grouped.entries()].map(([owner, options]) => (
            <fieldset key={owner} className="border-border rounded-[var(--radius-card)] border p-3">
              <legend className={textRole('label', 'px-1')}>
                {owner === 'owned'
                  ? 'Owned site'
                  : (readiness.competitors.find((item) => item.identity === owner)?.label ??
                    'Competitor')}
              </legend>
              <div className="grid gap-3">
                {options.map((option) => {
                  const checked = isSelected(option);
                  const current = selections.find(
                    (item) => selectedKey(item) === selectedKey(option),
                  );
                  return (
                    <div
                      key={selectedKey(option)}
                      className="grid grid-cols-[1fr_6rem] items-center gap-3"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(option)}
                        label={LABELS[option.kind]}
                      />
                      <Input
                        aria-label={`${LABELS[option.kind]} depth`}
                        disabled={
                          !checked ||
                          ['footprint', 'backlink_summary', 'backlink_history'].includes(
                            option.kind,
                          )
                        }
                        inputMode="numeric"
                        value={String(current?.depth ?? option.depth)}
                        onChange={(event) => updateDepth(option, Number(event.target.value))}
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <Checkbox
            checked={reuse}
            onCheckedChange={(checked) => setReuse(checked === true)}
            label="Reuse fresh matching snapshots when available"
          />
          <Checkbox
            checked={saveDefaults}
            onCheckedChange={(checked) => setSaveDefaults(checked === true)}
            label="Save scope and depth as project defaults"
          />
        </Stack>
      )}
    </Drawer>
  );
}
