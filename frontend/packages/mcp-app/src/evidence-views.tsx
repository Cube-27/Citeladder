import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { SectionTitle, textRole } from '@/components/ui/typography';
import type { AppState, Controller } from './controller';
import { rate } from './format';

const sourceSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      responses: z.number(),
      annotations: z.number(),
      citation_rate: z.number().nullable(),
      citation_share: z.number().nullable(),
    }),
  ),
  coverage: z.object({ responses: z.number(), prompts: z.number(), citations: z.number() }),
  pagination: z.object({ next_cursor: z.string().nullable() }),
});
type Props = Readonly<{ state: AppState; controller: Controller }>;

export function SourcesView({ state, controller }: Props) {
  const selection = state.selection!;
  const parsed = sourceSchema.safeParse(state.result?.evidence);
  if (!parsed.success)
    return <p className={textRole('body')}>No source evidence for the selected audit.</p>;
  const data = parsed.data;
  return (
    <div className="space-y-4">
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
      <p className={textRole('caption')}>
        {data.coverage.responses} responses · {data.coverage.prompts} prompts ·{' '}
        {data.coverage.citations} citations. Citation rate uses responses where the source was
        retrieved; citation share uses citations. These denominators differ.
      </p>
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
                    variant="ghost"
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
                <Button variant="ghost" onClick={() => void controller.drill(row.key)}>
                  Answers
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data.items.length && (
        <p className={textRole('body')}>No citations observed in this selection.</p>
      )}
      {data.pagination.next_cursor && (
        <Button
          variant="secondary"
          onClick={() =>
            void controller.select({ ...selection, cursor: data.pagination.next_cursor })
          }
        >
          Next sources
        </Button>
      )}
      <p className={textRole('caption')}>
        Names in cited answers are co-occurrence, not proof of presence on the publisher page.
      </p>
      {state.answers.map((answer, index) => (
        <article key={String(answer.id ?? index)} className="space-y-2">
          <SectionTitle>
            {typeof answer.prompt_text === 'string' ? answer.prompt_text : 'Answer evidence'}
          </SectionTitle>
          <p className={textRole('body')}>
            {typeof answer.answer_text === 'string'
              ? answer.answer_text
              : 'Fetch the referenced answer for its retained text.'}
          </p>
          <p className={textRole('caption')}>{String(answer.record_uri ?? '')}</p>
          {typeof answer.record_uri === 'string' && (
            <Button
              variant="ghost"
              onClick={() => void controller.fetchAnswer(String(answer.record_uri))}
            >
              Read retained answer
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

const siteSchema = z.object({
  state: z.string(),
  snapshot_id: z.string(),
  crawl_id: z.string(),
  observed_at: z.string(),
  scores: z.object({
    web_fundamentals: z.number().nullable(),
    aeo_readiness: z.number().nullable(),
    aeo_measurement_coverage: z.number().nullable(),
  }),
  coverage: z.object({ selected_urls: z.number(), analyzed_urls: z.number() }),
  measurement_states: z.record(z.string(), z.string()),
});
export function SiteHealthView({ state, controller }: Props) {
  const [findings, setFindings] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState<Record<string, unknown>[]>([]);
  const parsed = siteSchema.safeParse(state.result?.evidence);
  if (!parsed.success)
    return (
      <p className={textRole('body')}>
        No persisted Site Health snapshot. Start a crawl in CiteLadder, then return.
      </p>
    );
  const site = parsed.data;
  return (
    <div className="space-y-4">
      <SectionTitle>Persisted Site Health</SectionTitle>
      <p className={textRole('body')}>
        Web fundamentals: {site.scores.web_fundamentals ?? 'Unavailable'} · AEO readiness:{' '}
        {site.scores.aeo_readiness ?? 'Unavailable'} · measurement coverage:{' '}
        {rate(site.scores.aeo_measurement_coverage)}
      </p>
      <p className={textRole('caption')}>
        Observed {site.observed_at} · {site.coverage.analyzed_urls} analyzed /{' '}
        {site.coverage.selected_urls} selected URLs · crawl {site.crawl_id}
      </p>
      <p className={textRole('caption')}>
        {Object.entries(site.measurement_states)
          .map(([kind, value]) => `${kind}: ${value}`)
          .join(' · ')}
      </p>
      <p className={textRole('caption')}>
        Incomplete coverage is partial evidence. This snapshot has no historical period filter.
        Existing prioritized findings are current actions and may refer to different evidence.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          setFindings([]);
          setError(false);
          void controller
            .siteFindings()
            .then(setFindings)
            .catch(() => setError(true));
        }}
      >
        Read existing prioritized findings
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          setPages([]);
          setError(false);
          void controller
            .sitePages()
            .then(setPages)
            .catch(() => setError(true));
        }}
      >
        Read pages from this crawl
      </Button>
      {error && (
        <p role="alert" className={textRole('body')}>
          Findings are unavailable. Retry or reconnect.
        </p>
      )}
      {findings.map((finding, index) => (
        <article key={String(finding.id ?? index)}>
          <SectionTitle>{String(finding.title ?? finding.kind ?? 'Existing finding')}</SectionTitle>
          <p className={textRole('caption')}>{String(finding.record_uri ?? '')}</p>
        </article>
      ))}
      {pages.map((page, index) => (
        <article key={String(page.id ?? index)}>
          <SectionTitle>{String(page.url ?? page.title ?? 'Page evidence')}</SectionTitle>
          <p className={textRole('caption')}>{String(page.record_uri ?? '')}</p>
        </article>
      ))}
    </div>
  );
}
