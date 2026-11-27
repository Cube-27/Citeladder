import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { auditPage, makeAudit } from '@/test/fixtures/runs';
import { renderWithProviders } from '@/test/render';

import { useVisibilityRuns } from './use-visibility-runs';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const WIDE = '44444444-4444-4444-8444-444444444444';
const NARROW = '55555555-5555-4555-8555-555555555555';
const RUNS_PER_PROJECT = { [WIDE]: 25, [NARROW]: 3 };

function Picker({ projectId }: Readonly<{ projectId: string }>) {
  const { runPicker } = useVisibilityRuns({
    requestScope: { workspaceId: 'w1', projectId },
    market: null,
    selectedRunId: null,
    window: null,
    active: true,
  });
  return (
    <>
      <output>{runPicker.runs.length}</output>
      <button type="button" onClick={runPicker.runPage.onNext}>
        Older runs
      </button>
    </>
  );
}

it('returns the run picker to the first page when the project changes', async () => {
  mswServer.use(
    http.get('/api/v1/audits', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const projectId = params.get('project_id') === NARROW ? NARROW : WIDE;
      const audits = Array.from({ length: RUNS_PER_PROJECT[projectId] }, (_, index) =>
        makeAudit(index + 1, { project_id: projectId, status: 'completed' }),
      );
      const page = Number(params.get('page') ?? 1);
      const size = Number(params.get('page_size') ?? 10);
      return HttpResponse.json(
        auditPage(audits, { items: audits.slice((page - 1) * size, page * size), page }),
      );
    }),
  );
  const user = userEvent.setup();
  const view = renderWithProviders(<Picker projectId={WIDE} />);
  expect(await screen.findByText('10')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Older runs' }));
  await user.click(screen.getByRole('button', { name: 'Older runs' }));
  expect(await screen.findByText('5')).toBeVisible();

  view.rerender(<Picker projectId={NARROW} />);
  expect(await screen.findByText('3')).toBeVisible();
});
