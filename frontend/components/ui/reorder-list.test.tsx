import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { ReorderList } from './reorder-list';

const ITEMS = ['Alpha', 'Beta', 'Gamma'].map((name) => ({ key: name, name, content: name }));

function dropOn(name: string, text: string) {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`${name} renders in a row`);
  fireEvent.drop(row, { dataTransfer: { getData: () => text } });
}

describe('ReorderList', () => {
  it('moves a dragged row onto the row it is dropped on', () => {
    const moves: [number, number][] = [];
    render(<ReorderList items={ITEMS} pending={false} onMove={(...move) => moves.push(move)} />);

    dropOn('Gamma', '0');

    expect(moves).toEqual([[0, 2]]);
  });

  it('ignores text dropped from outside the list', () => {
    const onMove = vi.fn<(from: number, to: number) => void>();
    render(<ReorderList items={ITEMS} pending={false} onMove={onMove} />);

    dropOn('Beta', 'https://example.com');
    dropOn('Beta', '');
    dropOn('Beta', '7');
    dropOn('Beta', '1.5');
    dropOn('Gamma', '1');

    expect(onMove.mock.calls).toEqual([[1, 2]]);
  });

  it('moves a row with its named move controls', () => {
    const moves: [number, number][] = [];
    render(<ReorderList items={ITEMS} pending={false} onMove={(...move) => moves.push(move)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Beta up' }));

    expect(moves).toEqual([[1, 0]]);
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
  });
});
