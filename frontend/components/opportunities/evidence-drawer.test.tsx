import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OPPORTUNITY = '22222222-2222-4222-8222-222222222222';
const queryState = vi.hoisted(() => ({ data: null as unknown, error: null as unknown }));

/** The drawer opens on a project route, under the gate's project. */
const projectRoute = { projectSelection: { activeProject: makeProject({ id: PROJECT }) } };

vi.mock('@/lib/api/opportunities', () => ({
  opportunitiesQueries: {
    detail: (_workspaceId: string, opportunityId: string) => ({
      queryKey: ['opportunities', 'detail', opportunityId],
      queryFn: async () => {
        if (queryState.error) throw queryState.error;
        return queryState.data;
      },
    }),
  },
}));

import { EvidenceDrawer } from './evidence-drawer';

const TARGET = 'https://acme.test/pricing';

/** A loaded finding of this project; its evidence names `url`. */
function finding(url: string) {
  return {
    id: OPPORTUNITY,
    project_id: PROJECT,
    rule_id: 'missing_structured_data',
    title: 'Missing structured data on owned page',
    severity: 'medium',
    opportunity_type: 'site',
    target_url: TARGET,
    target_theme: null,
    target_prompt_id: null,
    created_at: '2026-11-10T10:00:00Z',
    remediation: 'Add schema.org structured data.',
    evidence: { url, crawl_id: OPPORTUNITY, site_url_id: OPPORTUNITY },
    content_handoff: { pathway: 'owned', limitations: [] },
  };
}

function renderDrawer() {
  renderWithProviders(
    <EvidenceDrawer
      opportunityId={OPPORTUNITY}
      title="Missing structured data on owned page"
      targetUrl={TARGET}
      projectId={PROJECT}
      open
      onOpenChange={vi.fn()}
    />,
    projectRoute,
  );
}

beforeEach(() => {
  queryState.data = null;
  queryState.error = null;
});

describe('EvidenceDrawer anatomy', () => {
  it('names the finding once in its header and repeats neither the target nor the row', async () => {
    queryState.data = finding(TARGET);
    renderDrawer();

    const drawer = await screen.findByRole('dialog', {
      name: 'Missing structured data on owned page',
    });
    expect(await within(drawer).findByText('Add schema.org structured data.')).toBeVisible();
    expect(within(drawer).getAllByText('Missing structured data on owned page')).toHaveLength(1);
    expect(drawer).not.toHaveTextContent('acme.test');
    expect(drawer).not.toHaveTextContent('Medium impact');
    expect(within(drawer).queryByRole('link', { name: 'View page' })).toBeNull();
    expect(within(drawer).queryByText('Supporting result')).toBeNull();
  });

  it('shows the evidence address where it differs from the target', async () => {
    queryState.data = finding('https://acme.test/pricing/compare');
    renderDrawer();

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Evidence')).toBeVisible();
    expect(drawer).toHaveTextContent('https://acme.test/pricing/compare');
  });
});

describe('EvidenceDrawer authorization and recovery', () => {
  it('does not expose another project’s detail', async () => {
    queryState.data = {
      id: OPPORTUNITY,
      project_id: '33333333-3333-4333-8333-333333333333',
    };

    renderWithProviders(
      <EvidenceDrawer
        opportunityId={OPPORTUNITY}
        targetUrl={null}
        projectId={PROJECT}
        open
        onOpenChange={vi.fn()}
      />,
      projectRoute,
    );

    expect(await screen.findByText(/unavailable in the selected project/i)).toBeVisible();
  });

  it('keeps a failed direct detail link dismissible', async () => {
    const onOpenChange = vi.fn();
    queryState.error = new ApiError('Opportunity not found', 404, '');
    const user = userEvent.setup();

    renderWithProviders(
      <EvidenceDrawer
        opportunityId={OPPORTUNITY}
        targetUrl={null}
        projectId={PROJECT}
        open
        onOpenChange={onOpenChange}
      />,
      projectRoute,
    );

    expect(await screen.findByText('Opportunity not found')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
