'use client';

import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import type { ObservedCompetitor, PromptMetricItem } from '@/lib/api/types';
import { textRole } from '@/components/ui/typography';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Stack } from '@/components/ui/layout';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { formatChange } from '@/components/visibility/ranking-rows';
import { formatRate } from '@/lib/visibility/dashboard';
import { PROMPT_ANALYSIS_MODES, PROMPT_ANALYSIS_PAGE_SIZE } from '@/lib/config/visibility';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { ledgerClasses } from '@/components/ui/workspace';

const promptModeCodec = stringUrlCodec(
  PROMPT_ANALYSIS_MODES.map((item) => item.value),
  'low',
);

/**
 * The prompt itself, and everything measured about it, behind one disclosure.
 */
function PromptDetail({
  row,
  onEvidence,
}: Readonly<{
  row: PromptMetricItem;
  onEvidence?: (slice: Record<string, string | null>) => void;
}>) {
  return (
    <details>
      <summary className="focus-ring cursor-pointer">{row.prompt_text}</summary>
      <Stack gap="compact">
        <p>
          {row.theme || 'Unclassified'} · {row.intent || 'Unclassified'}
        </p>
        <p>Owned citation rate: {formatRate(row.owned_citation_rate ?? null)}</p>
        <p>
          Prompt performance score:{' '}
          {row.composite_score?.toFixed(1) ?? 'Unavailable for a pooled period'}
        </p>
        <p>
          {Object.entries(row.components)
            .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value ?? 'Unavailable'}`)
            .join(' · ')}
        </p>
        <PromptOutcomes row={row} onEvidence={onEvidence} />
      </Stack>
    </details>
  );
}

/**
 * One prompt's per-cell outcomes: what each engine and model actually did with
 * it, and the way into the answers behind those counts.
 */
function PromptOutcomes({
  row,
  onEvidence,
}: Readonly<{
  row: PromptMetricItem;
  onEvidence?: (slice: Record<string, string | null>) => void;
}>) {
  return (
    <>
      {(row.outcomes ?? []).map((outcome) => (
        <Stack key={`${outcome.logical_engine}-${outcome.transport_model}`} gap="tight">
          <p>
            {outcome.logical_engine} · {outcome.transport_model}
          </p>
          <p>
            {outcome.counts.brand_responses} of {outcome.counts.responses} mention the brand ·{' '}
            {outcome.counts.owned_citation_responses} cite an owned source
          </p>
          <p>
            {Object.entries(outcome.gap_counts)
              .map(([name, count]) => `${name}: ${count} brand-absent answers`)
              .join(' · ') || 'No competitor presence gap observed'}
          </p>
          {onEvidence ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onEvidence({
                  selection: row.source_audit_ids?.length ? 'range' : 'run',
                  run: row.source_audit_ids?.length ? null : row.audit_id,
                  prompt: row.prompt_id ?? row.prompt_snapshot_id ?? null,
                  engine: outcome.logical_engine,
                })
              }
            >
              Open answers
            </Button>
          ) : null}
        </Stack>
      ))}
    </>
  );
}

export function PromptMovement({
  promptQuery,
  onEvidence,
}: Readonly<{
  promptQuery: UseQueryResult<PromptMetricItem[], unknown>;
  onEvidence?: (slice: Record<string, string | null>) => void;
}>) {
  const [mode, setMode] = useUrlState('prompt_mode', promptModeCodec, {
    clearKeys: ['prompt_page'],
  });
  const [theme, setTheme] = useUrlState('theme', optionalStringUrlCodec, {
    clearKeys: ['prompt_page'],
  });
  const [intent, setIntent] = useUrlState('intent', optionalStringUrlCodec, {
    clearKeys: ['prompt_page'],
  });
  const [pageValue, setPage] = useUrlState('prompt_page', optionalStringUrlCodec);
  const data = promptQuery.data ?? [];
  const page = Math.max(0, Number.parseInt(pageValue ?? '0', 10) || 0);
  const filtered = data.filter(
    (row) =>
      (!theme || (row.theme || 'Unclassified') === theme) &&
      (!intent || (row.intent || 'Unclassified') === intent),
  );
  const movement = mode === 'drops' || mode === 'gains';
  const rows = filtered.filter((row) =>
    movement
      ? row.visibility_delta != null &&
        (mode === 'drops' ? row.visibility_delta < 0 : row.visibility_delta > 0)
      : true,
  );
  rows.sort((a, b) => {
    const first = movement ? a.visibility_delta : a.visibility_rate;
    const second = movement ? b.visibility_delta : b.visibility_rate;
    if (first == null) return second == null ? a.prompt_index - b.prompt_index : 1;
    if (second == null) return -1;
    return (
      (mode === 'gains' || mode === 'strongest' ? second - first : first - second) ||
      a.prompt_index - b.prompt_index
    );
  });
  const dimensionOptions = (key: 'theme' | 'intent') => [
    { value: 'all', label: key === 'theme' ? 'All themes' : 'All intents' },
    ...[...new Set(data.map((row) => row[key] || 'Unclassified'))]
      .sort()
      .map((value) => ({ value, label: value })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt analysis</CardTitle>
        <div className="flex flex-wrap gap-2">
          <AnalysisChoice
            label="Prompt analysis mode"
            value={mode}
            options={PROMPT_ANALYSIS_MODES}
            onChange={setMode}
          />
          <AnalysisChoice
            label="Theme"
            value={theme ?? 'all'}
            options={dimensionOptions('theme')}
            onChange={(value) => setTheme(value === 'all' ? null : value)}
          />
          <AnalysisChoice
            label="Intent"
            value={intent ?? 'all'}
            options={dimensionOptions('intent')}
            onChange={(value) => setIntent(value === 'all' ? null : value)}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {promptQuery.isError ? <Alert tone="danger">Could not load prompt outcomes.</Alert> : null}
        {promptQuery.isLoading ? <p aria-busy="true">Loading prompt outcomes…</p> : null}
        {movement ? (
          <p className={textRole('meta', 'p-[var(--card-padding)]')}>
            Only comparable measured changes are listed; prompts without a compatible baseline are
            excluded.
          </p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt / theme</TableHead>
              <TableHead numeric>Visibility</TableHead>
              <TableHead numeric>Change</TableHead>
              <TableHead numeric className="hidden md:table-cell">
                Owned citation rate
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice(page * PROMPT_ANALYSIS_PAGE_SIZE, (page + 1) * PROMPT_ANALYSIS_PAGE_SIZE)
              .map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <PromptDetail row={row} onEvidence={onEvidence} />
                    <p className={textRole('meta')}>
                      {row.theme || 'Unclassified'} ·{' '}
                      {new Date(row.created_at).toLocaleDateString()}
                    </p>
                    {onEvidence ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onEvidence({
                            selection: row.source_audit_ids?.length ? 'range' : 'run',
                            run: row.source_audit_ids?.length ? null : row.audit_id,
                            prompt: row.prompt_id ?? row.prompt_snapshot_id ?? null,
                          })
                        }
                      >
                        Open answers
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell numeric>
                    {formatRate(row.visibility_rate ?? null)}
                    <p className={textRole('meta')}>
                      {row.counts?.brand_responses ?? 'Unknown'} of{' '}
                      {row.counts?.responses ?? 'unknown'} responses
                    </p>
                  </TableCell>
                  <TableCell numeric>
                    {formatChange(row.visibility_delta)}
                    {row.comparison ? (
                      <details>
                        <summary className="focus-ring cursor-pointer">
                          Matched observations
                        </summary>
                        <p>
                          {row.comparison.matched_cells} of {row.comparison.current_cells} current /{' '}
                          {row.comparison.baseline_cells} baseline responses
                        </p>
                        <p>
                          {formatRate(row.comparison.baseline_values.visibility ?? null)} →{' '}
                          {formatRate(row.comparison.current_values.visibility ?? null)}
                        </p>
                      </details>
                    ) : (
                      <span>{row.comparison_status?.replaceAll('_', ' ')}</span>
                    )}
                  </TableCell>
                  <TableCell numeric className="hidden md:table-cell">
                    {formatRate(row.owned_citation_rate ?? null)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!rows.length && !promptQuery.isLoading ? (
          <p className="p-[var(--card-padding)]">No prompts match this analysis mode.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 p-[var(--card-padding)]">
          <span>{rows.length} prompts</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page > 1 ? String(page - 1) : null)}
          >
            Previous prompts
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={(page + 1) * PROMPT_ANALYSIS_PAGE_SIZE >= rows.length}
            onClick={() => setPage(String(page + 1))}
          >
            Next prompts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompetitorSuggestions({
  projectId,
  suggestionsQuery,
}: Readonly<{
  projectId: string;
  suggestionsQuery: UseQueryResult<ObservedCompetitor[], unknown>;
}>) {
  const queryClient = useQueryClient();
  const acceptMutation = useMutation({
    mutationFn: (candidateId: string) =>
      visibilityApi.acceptCompetitorSuggestion(projectId, candidateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.visibility.competitorSuggestions(projectId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.commandCenter(projectId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.visibility.all });
    },
  });

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="grid gap-0.5">
        <h3 className={textRole('objectTitle')}>Competitor suggestions</h3>
        <p className="text-muted text-xs">
          Observed repeatedly in third-party citations. Verify relevance before adding.
        </p>
      </div>
      {suggestionsQuery.isError ? (
        <Alert tone="danger">Could not load competitor suggestions.</Alert>
      ) : null}
      {suggestionsQuery.data?.length ? (
        <ul className={ledgerClasses('boxed')}>
          {suggestionsQuery.data.map((candidate) => (
            <li
              key={candidate.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
            >
              <div className="grid gap-0.5">
                <p className={textRole('bodyStrong')}>{candidate.name}</p>
                <p className="text-muted text-xs">
                  {candidate.domain} · {candidate.prompt_count} prompts / {candidate.engine_count}{' '}
                  engines
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => acceptMutation.mutate(candidate.id)}
                disabled={acceptMutation.isPending}
              >
                Add competitor
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {!suggestionsQuery.data?.length && !suggestionsQuery.isLoading ? (
        <p className="text-muted text-xs">No repeated citation candidates yet.</p>
      ) : null}
      {acceptMutation.isError ? (
        <Alert tone="danger">Could not add that competitor. Try again.</Alert>
      ) : null}
    </div>
  );
}
