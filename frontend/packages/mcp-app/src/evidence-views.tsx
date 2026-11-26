import { useState } from 'react';
import { z } from 'zod';
import {
  mcpSiteSnapshotSchema,
  mcpUnavailableSchema,
  mcpVisibilitySourcesSchema,
  type AnalyticsSelection,
  type McpSitePage,
} from '@citeladder/contracts/mcp-app';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Disclosure } from '@/components/ui/disclosure';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import { SectionHeader, SectionTitle } from '@/components/ui/section';
import type { AppState, Controller } from './controller';
import { formattedText } from '@/lib/format';
import { moment, rate } from './format';
import { Stack } from '@/components/ui/layout';

type Props = Readonly<{ state: AppState; controller: Controller }>;

const notYetMeasured = mcpUnavailableSchema.extend({
  reason: z.enum(['no_completed_run', 'metrics_pending']),
});
const notYetMeasuredText = {
  no_completed_run: 'No completed measurement. Run a measurement in CiteLadder, then return.',
  metrics_pending:
    'The latest measurement has finished and its results are still being prepared. Check back shortly.',
} as const satisfies Record<z.infer<typeof notYetMeasured>['reason'], string>;

export function notYetMeasuredMessage(evidence: unknown): string | null {
  const parsed = notYetMeasured.safeParse(evidence);
  return parsed.success ? notYetMeasuredText[parsed.data.reason] : null;
}

export function SourcesView({
  state,
  selection,
  controller,
}: Props & Readonly<{ selection: AnalyticsSelection }>) {
  const parsed = mcpVisibilitySourcesSchema.safeParse(state.result?.evidence);
  if (!parsed.success) {
    const missing = notYetMeasuredMessage(state.result?.evidence);
    return (
      <Text as="p" variant="body" tone="ink-2" role={missing ? undefined : 'alert'}>
        {missing ?? 'Source evidence is unavailable for the selected audit. Retry or reconnect.'}
      </Text>
    );
  }
  const data = parsed.data;
  return (
    <Stack gap="loose">
      <div>
        <Select
          ariaLabel="Source grouping"
          value={selection.level}
          options={[
            { value: 'domain', label: 'Domains' },
            { value: 'url', label: 'URLs' },
          ]}
          onValueChange={(level) =>
            void controller.select({ ...selection, level, domain: null, cursor: null })
          }
        />
      </div>
      <Text as="p" variant="caption">
        {data.coverage.responses} responses · {data.coverage.prompts} prompts ·{' '}
        {data.coverage.citations} citations. Citation rate uses responses where the source was
        retrieved; citation share uses citations. These denominators differ.
      </Text>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Citations</TableHead>
            <TableHead>Citation rate</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{row.key}</TableCell>
              <TableCell>{row.annotations}</TableCell>
              <TableCell>{rate(row.citation_rate)}</TableCell>
              <TableCell>
                {selection.level === 'domain' && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void controller.select({
                        ...selection,
                        level: 'url',
                        domain: row.key,
                        cursor: null,
                      })
                    }
                  >
                    URLs
                  </Button>
                )}
                <Button variant="quiet" onClick={() => void controller.drill(row.key)}>
                  Answers
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data.items.length && (
        <Text as="p" variant="body" tone="ink-2">
          No citations observed in this selection.
        </Text>
      )}
      {data.pagination.next_cursor && (
        <div>
          <Button
            variant="secondary"
            onClick={() =>
              void controller.select({ ...selection, cursor: data.pagination.next_cursor })
            }
          >
            Next sources
          </Button>
        </div>
      )}
      <Text as="p" variant="caption">
        Names in cited answers are co-occurrence, not proof of presence on the publisher page.
      </Text>
      {state.answers.map((answer) => (
        <Stack as="article" gap="item" key={answer.task_id}>
          <Text as="h3" variant="label">
            {answer.prompt_text}
          </Text>
          <Text as="p" variant="body" tone="ink-2">
            {answer.answer_text ?? 'Fetch the referenced answer for its retained text.'}
          </Text>
          <Text as="p" variant="caption">
            {answer.logical_engine} · {moment(answer.completed_at)}
          </Text>
          <div>
            <Button variant="quiet" onClick={() => void controller.fetchAnswer(answer.record_uri)}>
              Read retained answer
            </Button>
          </div>
        </Stack>
      ))}
    </Stack>
  );
}

export function SiteHealthView({ state, controller }: Props) {
  const [findings, setFindings] = useState<Awaited<ReturnType<Controller['siteFindings']>>>(null);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [findingsError, setFindingsError] = useState(false);
  const [pagesError, setPagesError] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<McpSitePage[]>([]);
  const parsed = mcpSiteSnapshotSchema.safeParse(state.result?.evidence);
  if (!parsed.success) {
    const missing = mcpUnavailableSchema
      .extend({ reason: z.literal('no_site_snapshot') })
      .safeParse(state.result?.evidence);
    return (
      <Text as="p" variant="body" tone="ink-2" role={missing.success ? undefined : 'alert'}>
        {missing.success
          ? 'No persisted Site Health snapshot. Start a crawl in CiteLadder, then return.'
          : 'Site Health evidence is unavailable. Retry or reconnect.'}
      </Text>
    );
  }
  const site = parsed.data;
  return (
    <Stack gap="loose">
      <SectionHeader>
        <SectionTitle>Persisted Site Health</SectionTitle>
      </SectionHeader>
      <Text as="p" variant="body" tone="ink-2">
        Web fundamentals: {site.scores.web_fundamentals ?? 'Unavailable'} · AEO readiness:{' '}
        {site.scores.aeo_readiness ?? 'Unavailable'} · measurement coverage:{' '}
        {formattedText(rate(site.scores.aeo_measurement_coverage))}
      </Text>
      <Text as="p" variant="caption">
        Observed {moment(site.observed_at)} · {site.coverage.analyzed_urls} analyzed /{' '}
        {site.coverage.selected_urls} selected URLs
      </Text>
      <Text as="p" variant="caption">
        {Object.entries(site.measurement_states)
          .map(([kind, value]) => `${kind}: ${value}`)
          .join(' · ')}
      </Text>
      <Text as="p" variant="caption">
        Incomplete coverage is partial evidence. This snapshot has no historical period filter.
        Actions are current and may refer to different evidence than this snapshot.
      </Text>
      <Disclosure title="Processing versions">
        <Stack as="dl" gap="item">
          {Object.entries(site.versions).map(([kind, version]) => (
            <div key={kind}>
              <Text as="dt" variant="caption" wrap="all">
                {kind.replaceAll('_', ' ')} version
              </Text>
              <Text as="dd" variant="caption" wrap="all">
                {version ?? 'Not recorded'}
              </Text>
            </div>
          ))}
        </Stack>
      </Disclosure>
      <div>
        <Button
          variant="secondary"
          disabled={loadingFindings}
          onClick={() => {
            setFindings(null);
            setLoadingFindings(true);
            setFindingsError(false);
            void controller
              .siteFindings()
              .then(setFindings)
              .catch(() => setFindingsError(true))
              .finally(() => setLoadingFindings(false));
          }}
        >
          Read current Actions
        </Button>
        <Button
          variant="secondary"
          disabled={loadingPages}
          onClick={() => {
            setPages([]);
            setPagesError(false);
            setLoadingPages(true);
            void controller
              .sitePages(site.crawl_id)
              .then(setPages)
              .catch(() => setPagesError(true))
              .finally(() => setLoadingPages(false));
          }}
        >
          Read pages from this crawl
        </Button>
      </div>
      {findingsError && (
        <Text as="p" variant="body" tone="ink-2" role="alert">
          Actions are unavailable. Retry or reconnect.
        </Text>
      )}
      {pagesError && (
        <Text as="p" variant="body" tone="ink-2" role="alert">
          Page evidence is unavailable. Retry or reconnect.
        </Text>
      )}
      {(loadingPages || loadingFindings) && (
        <div>
          {loadingPages && <output>Loading persisted pages…</output>}
          {loadingFindings && <output>Loading Actions…</output>}
        </div>
      )}
      {findings?.state === 'unavailable' && (
        <Text as="output" variant="body" tone="ink-2" box="block">
          Actions are unavailable. Retry or reconnect.
        </Text>
      )}
      {findings?.state === 'available' && !findings.items.length && (
        <Text as="output" variant="body" tone="ink-2" box="block">
          No open Actions for this project.
        </Text>
      )}
      {(findings?.state === 'available' ? findings.items : []).map((action) => (
        <article key={action.id}>
          <Text as="h3" variant="label" wrap="truncate" title={action.target_label}>
            {action.target_label}
          </Text>
          {action.approach && (
            <Text as="p" variant="body" tone="ink-2">
              {action.approach}
            </Text>
          )}
          <Text as="p" variant="caption" wrap="truncate" title={action.target_url ?? undefined}>
            {action.status.replaceAll('_', ' ')}
            {action.target_url && ` · ${action.target_url}`}
          </Text>
        </article>
      ))}
      {pages.map((page) => (
        <article key={page.site_url_id}>
          <Text as="h3" variant="label" wrap="truncate" title={page.url}>
            {page.url}
          </Text>
          {page.title && page.title !== page.url && (
            <Text as="p" variant="caption">
              {page.title}
            </Text>
          )}
        </article>
      ))}
    </Stack>
  );
}
