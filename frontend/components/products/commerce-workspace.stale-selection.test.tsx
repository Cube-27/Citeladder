import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

const discover = vi.fn();

vi.mock('./catalog-header', () => ({ CatalogHeader: () => <div>Catalog header</div> }));

vi.mock('./catalog-list', () => ({
  catalogEntries: () => ({ categories: [], products: [] }),
  CatalogList: ({ onToggle }: Readonly<{ onToggle: (keys: string[]) => void }>) => (
    <button type="button" onClick={() => onToggle(['stale-target'])}>
      Create stale selection
    </button>
  ),
}));

vi.mock('@/lib/products/use-commerce-target', () => ({
  targetKey: () => '',
  useCommerceTarget: () => ({ target: null, selectTarget: vi.fn() }),
}));

vi.mock('@/lib/products/use-products-screen', () => ({
  useCommerceQueries: () => ({
    catalog: { data: { categories: [], products: [] } },
  }),
}));

vi.mock('@/lib/products/competitor-discovery', () => ({
  useCompetitorDiscovery: () => ({
    discover: { isPending: false, mutate: discover },
  }),
}));

vi.mock('@/lib/products/use-resizable-pane', () => ({
  MAX_PANE_WIDTH: 520,
  MIN_PANE_WIDTH: 240,
  useResizablePane: () => ({
    width: 320,
    dragging: false,
    keyboardStep: 16,
    beginDrag: vi.fn(),
    dragTo: vi.fn(),
    endDrag: vi.fn(),
    nudge: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { CommerceWorkspace } from './commerce-workspace';

describe('CommerceWorkspace stale bulk selection', () => {
  it('keeps stale checked keys clearable when no catalog target matches', () => {
    renderWithProviders(<CommerceWorkspace projectId="11111111-1111-4111-8111-111111111111" />);

    fireEvent.click(screen.getByRole('button', { name: 'Create stale selection' }));

    expect(screen.getByText('No targets selected')).toBeVisible();
    const clear = screen.getByRole('button', { name: 'Clear selection' });
    expect(clear).toBeEnabled();

    fireEvent.click(clear);
    expect(screen.queryByText('No targets selected')).not.toBeInTheDocument();
  });
});
