import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { project, getDashboard, downloadDashboardReport } = vi.hoisted(() => ({
  project: {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: '00000000-0000-4000-8000-000000000002',
    name: 'Acme',
    brand_name: 'Acme',
    website_url: 'https://acme.com',
  },
  getDashboard: vi.fn(),
  downloadDashboardReport: vi.fn().mockResolvedValue(new Blob(['pdf'])),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      project,
      generated_at: '2026-07-28T00:00:00Z',
      executive_metrics: {
        visibility_score: 72.5,
        site_health_score: null,
        open_opportunities: 2,
        active_prompts: 8,
      },
      active_work: ['site_health'],
      ai_presence: {
        current: {
          score: 61.2,
          formula_kind: 'cross_industry',
          formula_version: 'ai-presence-v1',
          provisional: true,
          coverage: { web_fundamentals: false },
          components: { web_fundamentals: { score: null, weight: 0.3, available: false } },
          source_snapshot_ids: {},
          versions: { formula: 'ai-presence-v1' },
          comparable_to_latest: null,
          timestamp: '2026-07-28T00:00:00Z',
        },
        momentum: null,
        trend_points: [],
      },
      analyze: [
        {
          id: 'visibility',
          title: 'Visibility',
          href: '/visibility',
          state: 'ready',
          metrics: { visibility_score: 72.5 },
          source: null,
        },
      ],
      improve: [
        {
          id: 'site_health',
          title: 'Site Health',
          href: '/site-health',
          state: 'running',
          metrics: { overall_score: null },
          source: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: project, isLoading: false }),
}));

vi.mock('@/lib/api/projects', () => ({
  projectsApi: { getDashboard, downloadDashboardReport },
}));

import { DashboardScreen } from './dashboard-screen';

describe('DashboardScreen', () => {
  it('renders persisted summary sections and links to their source surfaces', () => {
    render(<DashboardScreen />);

    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    // 72.5 renders twice: the executive metric tile and the Visibility
    // section card's primary metric both carry the persisted score.
    expect(screen.getAllByText('72.5')).toHaveLength(2);
    expect(screen.getByText(/currently reviewing your website/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open visibility/i })).toHaveAttribute(
      'href',
      '/visibility',
    );
    expect(screen.getByRole('link', { name: /open site health/i })).toHaveAttribute(
      'href',
      '/site-health',
    );
    expect(screen.getByLabelText('AI Presence Index')).toBeInTheDocument();
    expect(screen.getByText(/more results will improve this view/i)).toBeInTheDocument();
    expect(screen.queryByText(/formula|provenance|snapshot/i)).not.toBeInTheDocument();
  });

  it('downloads the authenticated report blob', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<DashboardScreen />);
    await user.click(screen.getByRole('button', { name: /download report/i }));

    expect(downloadDashboardReport).toHaveBeenCalledWith(project.id);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('shows a recoverable error when report download fails', async () => {
    downloadDashboardReport.mockRejectedValueOnce(new Error('download failed'));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<DashboardScreen />);
    await user.click(screen.getByRole('button', { name: /download report/i }));

    expect(
      await screen.findByText('Could not download the report. Please try again.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /download report/i }));
    await waitFor(() =>
      expect(
        screen.queryByText('Could not download the report. Please try again.'),
      ).not.toBeInTheDocument(),
    );
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
