import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Analytics } from './analytics';
import { createController, deepLinkSelection } from './controller';

const project = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const audit = '33333333-3333-4333-8333-333333333333';
const links = {
  application: 'https://app.example.test/visibility',
  onboarding: 'https://app.example.test/onboarding',
};
const result = (project_id = project) => ({
  surface: 'citeladder_analytics',
  selection: { project_id, audit_id: audit, view: 'overview' },
  links,
  evidence: { state: 'unavailable' },
});

describe('CiteLadder MCP App', () => {
  it.each(['render_site_health', undefined])(
    'accepts a Site Health host result with tool identity %s',
    (toolName) => {
      const controller = createController({
        call: vi.fn(async () => undefined),
        context: vi.fn(async () => undefined),
      });
      controller.begin({ project_id: project }, toolName);
      controller.receive({
        ...result(),
        selection: { project_id: project, view: 'site_health', snapshot_id: audit },
        evidence: {
          state: 'available',
          snapshot_id: audit,
          crawl_id: foreign,
          observed_at: '2026-10-01T00:00:00Z',
          scores: { web_fundamentals: 50, aeo_readiness: null, aeo_measurement_coverage: 0.5 },
          coverage: { selected_urls: 2, analyzed_urls: 1 },
          measurement_states: { coverage: 'partial', aeo: 'unknown' },
        },
      });
      render(<Analytics controller={controller} />);
      expect(screen.getByRole('tab', { name: 'Site Health' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText('Persisted Site Health')).toBeInTheDocument();
      expect(screen.queryByText('Loading persisted evidence…')).not.toBeInTheDocument();
    },
  );
  it('rejects mismatched host filters and invalidates old host replies on local reads and disconnect', async () => {
    let finish!: (value: unknown) => void;
    const controller = createController({
      call: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      context: vi.fn(async () => undefined),
    });
    const selection = {
      project_id: project,
      view: 'trends',
      from_at: '2026-10-01T00:00:00Z',
      to_at: '2026-10-02T00:00:00Z',
    };
    controller.begin(selection, 'render_visibility');
    controller.receive({
      ...result(),
      selection: { ...selection, from_at: '2026-09-01T00:00:00Z' },
    });
    expect(controller.getSnapshot().result).toBeNull();
    const pending = controller.select({ ...selection, engine: 'gemini' });
    controller.receive({ ...result(), selection });
    expect(controller.getSnapshot().busy).toBe(true);
    finish({ state: 'available', points: [] });
    await pending;
    expect(controller.getSnapshot().selection?.engine).toBe('gemini');
    controller.disconnect();
    controller.receive({ ...result(), selection });
    expect(controller.getSnapshot().result).toBeNull();
    expect(controller.getSnapshot().error).toMatch(/Connect/);
  });
  it('ignores an old answer-fetch failure after a project switch and pins the application handoff', async () => {
    let fail!: (reason: Error) => void;
    const call = vi.fn(async () => ({ audit_id: audit, state: 'available' }) as unknown);
    const context = vi.fn(async () => undefined);
    const controller = createController({ call, context });
    controller.receive(result());
    call.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = controller.fetchAnswer(`citeladder://visibility_result/${audit}`);
    await controller.select({ project_id: foreign });
    const application = new URL(controller.getSnapshot().result!.links.application);
    expect(application.searchParams.get('run')).toBe(audit);
    fail(new Error('old fetch timed out'));
    await pending;
    expect(controller.getSnapshot().selection?.project_id).toBe(foreign);
    expect(controller.getSnapshot().result?.evidence.state).toBe('available');
    expect(controller.getSnapshot().error).toBeNull();
    await vi.waitFor(() =>
      expect(context).toHaveBeenLastCalledWith(
        expect.objectContaining({ project_id: foreign }),
        expect.objectContaining({ audit_id: audit }),
      ),
    );
    call.mockRejectedValueOnce(new Error('current access denied'));
    await controller.fetchAnswer(`citeladder://visibility_result/${audit}`);
    expect(controller.getSnapshot().result).toBeNull();
    expect(controller.getSnapshot().error).toMatch(/reconnect/);
  });
  it('renders observed zero separately from missing metrics and exposes keyboard view navigation', async () => {
    const user = userEvent.setup();
    const controller = createController({
      call: vi.fn(async () => ({ state: 'unavailable' })),
      context: vi.fn(async () => undefined),
    });
    controller.receive({
      ...result(),
      evidence: {
        project_id: project,
        audit_id: audit,
        audit_status: 'completed',
        analyzer_version: '1',
        scoring_rule_version: '1',
        total_completed: 2,
        total_failed: 0,
        visibility_score: null,
        visibility_rate: 0.5,
        owned_citation_rate: 0,
        rankings: [],
        per_engine: [],
        sentiment: null,
        avg_position: null,
        created_at: '2026-10-01T00:00:00Z',
      },
    });
    render(<Analytics controller={controller} />);
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: 'Overview' });
    tab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sources' })).toBeDisabled();
    expect(screen.getByText('No measured runs in this window.')).toBeInTheDocument();
  });
  it('pins Sources to resolved evidence and clears it on a project switch, ignoring late responses', async () => {
    let finish!: (value: unknown) => void;
    const call = vi.fn(async () => ({ state: 'available', audit_id: audit }) as unknown);
    const controller = createController({ call, context: vi.fn(async () => undefined) });
    await controller.select({ project_id: project });
    await controller.select({ ...controller.getSnapshot().selection, view: 'sources' });
    expect(call).toHaveBeenLastCalledWith(
      'read_visibility_sources',
      expect.objectContaining({ project_id: project, audit_id: audit }),
    );
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.select({ project_id: project });
    expect(controller.getSnapshot().result).toBeNull();
    await controller.select({ project_id: foreign });
    finish({ audit_id: audit, state: 'available', private: 'old project evidence' });
    await pending;
    expect(controller.getSnapshot().result?.selection?.project_id).toBe(foreign);
    expect(controller.getSnapshot().result?.evidence).not.toHaveProperty('private');
    controller.receive(result(project));
    expect(controller.getSnapshot().selection?.project_id).toBe(foreign);
  });
  it('clears displayed snapshot and model context when access to its pages is revoked', async () => {
    const context = vi.fn(async () => undefined);
    const controller = createController({
      call: vi.fn(async () => {
        throw new Error('revoked');
      }),
      context,
    });
    controller.receive({
      ...result(),
      selection: { project_id: project, view: 'site_health' },
      evidence: { crawl_id: audit, state: 'partial' },
    });
    await expect(controller.sitePages()).rejects.toThrow('revoked');
    await Promise.resolve();
    expect(controller.getSnapshot().result).toBeNull();
    expect(controller.getSnapshot().error).toMatch(/reconnect/);
    expect(context).toHaveBeenLastCalledWith(null, undefined);
  });
  it('shows no-evidence and reconnect recovery without preserving old evidence on denied reads', async () => {
    const user = userEvent.setup();
    const call = vi.fn(async () => {
      throw new Error('revoked');
    });
    const controller = createController({ call, context: vi.fn(async () => undefined) });
    call.mockResolvedValueOnce({
      projects: [{ id: project, workspace_name: 'Team', name: 'Acme' }],
      pagination: { next_cursor: null },
    } as never);
    await controller.loadProjects();
    controller.receive(result());
    render(<Analytics controller={controller} />);
    expect(screen.getByRole('combobox', { name: 'Project and workspace' })).toHaveTextContent(
      'Team / Acme',
    );
    expect(screen.getByText(/No completed measurement/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh connection' }));
    expect(screen.getByRole('alert').textContent).toMatch(/reconnect/);
    expect(screen.queryByText(/No completed measurement/)).not.toBeInTheDocument();
    expect(screen.queryByText('Team / Acme')).not.toBeInTheDocument();
    call.mockResolvedValueOnce({
      projects: [{ id: project, workspace_name: 'Team', name: 'Acme' }],
      pagination: { next_cursor: null },
    } as never);
    await user.click(screen.getByRole('button', { name: 'Refresh connection' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('uses concrete source drill-down IDs and validates untrusted model/deep-link selections', async () => {
    const call = vi.fn(async () => ({ items: [] }));
    const controller = createController({ call, context: vi.fn(async () => undefined) });
    controller.receive({
      ...result(),
      selection: { project_id: project, audit_id: audit, view: 'sources', level: 'url' },
    });
    await controller.drill('https://publisher.example/a');
    expect(call).toHaveBeenCalledWith(
      'read_visibility_results',
      expect.objectContaining({ audit_id: audit, url: 'https://publisher.example/a' }),
    );
    expect(
      deepLinkSelection({ url: `/analytics?project_id=${project}&view=sources&audit_id=${audit}` })
        ?.audit_id,
    ).toBe(audit);
    expect(deepLinkSelection({ url: `//evil.example/analytics?project_id=${project}` })).toBeNull();
    expect(deepLinkSelection({ url: `/analytics?project_id=${project}&total=100` })).toBeNull();
    act(() =>
      controller.receive({ ...result(), links: { ...links, application: 'javascript:alert(1)' } }),
    );
    expect(controller.getSnapshot().selection?.view).toBe('sources');
  });
});
