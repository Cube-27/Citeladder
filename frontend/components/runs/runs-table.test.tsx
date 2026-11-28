import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { Audit } from '@citeladder/contracts';
import { pageNumberControls } from '@/components/ui/pager';
import { makeAudit as audit } from '@/test/fixtures/runs';
import { renderWithProviders as render } from '@/test/render';

import { DISPLAY_TIME_ZONE_COOKIE } from '@/lib/display-timezone';
import { RunsTable, type RunsTablePage } from './runs-table';

beforeEach(() => {
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=UTC; Path=/`;
});

afterEach(() => {
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=; Path=/; Max-Age=0`;
});

const TABLE: RunsTablePage = {
  sort: { key: 'created', descending: true },
  onSort: () => undefined,
  pageSize: 10,
  pager: {
    ...pageNumberControls(1, 1, () => undefined),
    range: { from: 1, to: 1, total: 1, noun: 'runs' },
    pageSize: { value: 10, onChange: () => undefined },
  },
};

function renderTable(audits: Audit[]) {
  return render(
    <RunsTable audits={audits} table={TABLE} status={null} emptyHeading="No failed runs" />,
  );
}

const runLinks = () => screen.getAllByRole('link', { name: /audit|repair run/ });

describe('RunsTable', () => {
  it('names each row by its run and links it to that run', () => {
    const rows = [audit(1), audit(2, { created_at: '2026-07-30T00:00:00Z' })];
    renderTable(rows);

    const links = runLinks();
    expect(links[0]).toHaveAccessibleName('Aug 1, 2026, 12:00 AM · Brand audit');
    expect(links[0]).toHaveAttribute('href', `/runs/${rows[0]!.id}`);
    expect(links[1]).toHaveAccessibleName('Jul 30, 2026, 12:00 AM · Brand audit');
    expect(links[1]).toHaveAttribute('href', `/runs/${rows[1]!.id}`);
  });

  it.each([
    [{ audit_scope: 'brand' }, 'Aug 1, 2026, 12:00 AM · Brand audit'],
    [{ audit_scope: 'commerce' }, 'Aug 1, 2026, 12:00 AM · Commerce audit'],
    [
      { audit_scope: 'brand', parent_audit_id: '99999999-1111-4111-8111-111111111111' },
      'Aug 1, 2026, 12:00 AM · Brand repair run',
    ],
  ] as const)('distinguishes a run by what it measured (%o)', (overrides, name) => {
    renderTable([audit(1, overrides)]);

    expect(screen.getByRole('link', { name })).toBeVisible();
  });

  it('gives way to one empty state, head included, when there are no runs', () => {
    renderTable([]);

    expect(screen.queryByRole('columnheader')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'No failed runs' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /audit/ })).toBeNull();
  });

  it('announces the polling note in a live region that was mounted while idle', () => {
    const { rerender } = renderTable([audit(1)]);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    rerender(
      <RunsTable
        audits={[audit(1)]}
        table={TABLE}
        status="Updating"
        emptyHeading="No failed runs"
      />,
    );

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Updating');
  });
});
