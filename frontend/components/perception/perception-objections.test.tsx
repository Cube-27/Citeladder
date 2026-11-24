import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it } from 'vite-plus/test';

import type { ProbeObjectionsValue } from '@citeladder/contracts/probes';
import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { projectScope, renderWithProviders } from '@/test/render';

import { PerceptionObjections } from './perception-objections';

const RUN = '11111111-1111-4111-8111-111111111111';
const id = (digit: string) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const ANSWERS = [
  { id: id('2'), logical_engine: 'chatgpt', repetition: 1 },
  { id: id('3'), logical_engine: 'chatgpt', repetition: 2 },
  { id: id('4'), logical_engine: 'claude', repetition: 1 },
  { id: id('5'), logical_engine: 'claude', repetition: 2 },
] as const;
const QUESTION = 'Why might someone not choose Acme?';
const project = makeProject();

const data: ProbeObjectionsValue = {
  state: 'value',
  probe: {
    launch_id: RUN,
    created_at: '2026-11-24T00:00:00Z',
    engines: ['chatgpt', 'claude'],
    markets: [{ id: null, country_code: 'US', language_code: 'en' }],
    answers: 4,
  },
  brand: 'Acme',
  question: { text: QUESTION, run_id: RUN, execution_id: ANSWERS[0].id },
  answers: 4,
  answered_by: ['chatgpt', 'claude'],
  average: 100,
  groups: [
    {
      id: id('9'),
      name: 'Too expensive',
      score: 100,
      engines: ['chatgpt'],
      history: [100],
      quotes: [
        {
          text: 'pricey',
          logical_engine: 'chatgpt',
          prompt: QUESTION,
          run_id: RUN,
          execution_id: ANSWERS[0].id,
        },
      ],
      sources: 0,
      pages: [],
    },
  ],
};

const evidence = (answer: (typeof ANSWERS)[number]) => ({
  id: answer.id,
  analysis_id: answer.id,
  audit_id: RUN,
  task_id: answer.id,
  artifact_id: null,
  analyzer_version: '1',
  scoring_rule_version: '1',
  logical_engine: answer.logical_engine,
  transport_provider: 'x',
  transport_model: 'm',
  retrieval_enabled: true,
  prompt_index: 1,
  repetition: answer.repetition,
  prompt_class: 'unbranded',
  cohort: 'probe',
  answer_text: `Answer of ${answer.logical_engine} ${answer.repetition}.`,
  search_surface_outcome: '',
  brand_mentioned: false,
  brand_first_offset: null,
  owned_domain_cited: false,
  owned_citation_count: 0,
  unintended_domain_cited: false,
  citation_count: 0,
  search_used: false,
  search: 'not_used',
  search_query_count: 0,
  avg_position: null,
  first_named: { kind: 'none' },
  named: [],
  answer_formats: { kind: 'not_applicable' },
  score: null,
  citations: [],
  competitors_mentioned: [],
  search_surface: null,
  perception: [],
  claims: [],
  ads: { applicability: 'not_applicable', parser_version: null, items: [] },
  created_at: '2026-11-24T00:00:00Z',
});

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

it('asks the objection question once, as a link to its answers by engine and repetition', async () => {
  mswServer.use(
    ...ANSWERS.map((answer) =>
      http.get(`/api/v1/executions/${answer.id}`, () => HttpResponse.json(evidence(answer))),
    ),
    http.get(`/api/v1/audits/${RUN}/executions`, () =>
      HttpResponse.json(
        ANSWERS.map((answer) => ({
          ...answer,
          prompt_index: 1,
          transport_provider: 'x',
          status: 'succeeded',
          prompt_text: QUESTION,
          error_code: '',
          latency_ms: 1,
        })),
      ),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(
    <PerceptionObjections
      scope={{ workspaceId: project.workspace_id, projectId: project.id }}
      data={data}
    />,
    { projectSelection: projectScope(project) },
  );
  await user.click(screen.getByRole('button', { name: 'Too expensive' }));
  expect(screen.getAllByText(QUESTION)).toHaveLength(1);

  await user.click(screen.getByRole('link', { name: QUESTION }));
  const dialog = await screen.findByRole('dialog', { name: QUESTION });
  await within(dialog).findByText('Answer of chatgpt 1.', {}, { timeout: 15_000 });
  await user.click(within(dialog).getByRole('button', { name: /^Repetition:/u }));
  await user.click(screen.getByRole('menuitemradio', { name: '2' }));
  expect(await within(dialog).findByText('Answer of chatgpt 2.')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: /^Engine:/u }));
  await user.click(screen.getByRole('menuitemradio', { name: /claude/iu }));
  expect(await within(dialog).findByText('Answer of claude 2.')).toBeInTheDocument();
}, 20_000);
