'use client';

import { useMemo, useState } from 'react';
import { SEARCH_MAX_DEPTH } from '@/lib/config/search-intelligence';

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

const DEPTHS = {
  footprint: 1,
  ranking_keywords: 500,
  keyword_suggestions: 500,
  backlink_summary: 1,
  referring_domains: 1000,
  destination_pages: 1000,
  missing_keywords: 500,
  shared_keywords: 500,
} as const;
const LABELS: Record<string, string> = {
  footprint: 'Keyword footprint',
  ranking_keywords: 'Ranked keywords',
  keyword_suggestions: 'Keyword suggestions',
  backlink_summary: 'Backlink summary',
  referring_domains: 'Referring domains',
  destination_pages: 'Destination pages',
  missing_keywords: 'Competitor missing keywords',
  shared_keywords: 'Competitor shared keywords',
};

function availableSelections(data: SearchIntelligenceReadiness): DatasetSelection[] {
  const own = [
    'footprint',
    'ranking_keywords',
    'keyword_suggestions',
    'backlink_summary',
    'referring_domains',
    'destination_pages',
  ].map((kind) => ({
    kind,
    depth: data.preferences.depths[kind] ?? DEPTHS[kind as keyof typeof DEPTHS],
  }));
  const competitorIds = data.preferences.competitor_ids.length
    ? data.preferences.competitor_ids
    : data.competitors.map(({ identity }) => identity);
  return [
    ...own,
    ...competitorIds.flatMap((competitor_id) =>
      ['footprint', 'missing_keywords', 'shared_keywords'].map((kind) => ({
        kind,
        competitor_id,
        depth: data.preferences.depths[kind] ?? DEPTHS[kind as keyof typeof DEPTHS],
      })),
    ),
  ];
}

function defaultSelections(data: SearchIntelligenceReadiness): DatasetSelection[] {
  return availableSelections(data).filter(({ kind }) => kind !== 'keyword_suggestions');
}

function reviewInputsValid(
  selections: DatasetSelection[],
  ownedTarget: string,
  location: string,
  seed: string,
) {
  return Boolean(
    selections.length &&
    ownedTarget &&
    Number.isInteger(Number(location)) &&
    Number(location) > 0 &&
    selections.every((item) => item.kind !== 'keyword_suggestions' || seed.trim()),
  );
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
    defaultSelections(readiness),
  );
  const [location, setLocation] = useState(String(readiness.preferences.location_code ?? 2840));
  const [language, setLanguage] = useState(readiness.preferences.language_code || 'en');
  const [seed, setSeed] = useState('');
  const [ownedTarget, setOwnedTarget] = useState(
    readiness.preferences.owned_target_id ?? readiness.owned_targets[0]?.identity ?? '',
  );
  const [reuse, setReuse] = useState(readiness.preferences.reuse_recent);
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
  const canReview = reviewInputsValid(selections, ownedTarget, location, seed);
  const submitReview = async () => {
    setError('');
    try {
      setReview(
        await onReview({
          action,
          owned_target_id: ownedTarget,
          location_code: Number(location),
          language_code: language,
          reuse_recent: reuse,
          save_as_defaults: saveDefaults,
          datasets: selections.map((selection) =>
            selection.kind === 'keyword_suggestions' ? { ...selection, seed } : selection,
          ),
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
              Confirm ${Number(review.estimated_cost_usd).toFixed(4)} acquisition
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
                <dd className="text-xl tabular-nums">
                  ${Number(review.estimated_cost_usd).toFixed(4)}
                </dd>
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
                  key={String(call.request_key)}
                >
                  <span>
                    {index + 1}. {String(call.dataset_kind).replaceAll('_', ' ')}
                  </span>
                  <span className="text-muted float-right">
                    ${Number(call.estimated_cost_usd).toFixed(4)}
                  </span>
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
              <span>Location code</span>
              <Input
                id="search-location-code"
                inputMode="numeric"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
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
                        disabled={!checked || option.kind === 'backlink_summary'}
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
