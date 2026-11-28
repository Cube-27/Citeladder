import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { Pager, pageNumberControls } from '@/components/ui/pager';

describe('Pager', () => {
  it('shows the range with its total and the page size, and drops the total on a cursor table', async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pager
        {...pageNumberControls(1, 5, onPageChange)}
        range={{ from: 1, to: 10, total: 42, noun: 'prompts' }}
        pageSize={{ value: 10, onChange: () => undefined }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1–10 of 42 prompts');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole('combobox', { name: 'Rows per page for prompts' })).toHaveTextContent(
      '10',
    );

    rerender(
      <Pager
        {...pageNumberControls(2, 3, onPageChange)}
        range={{ from: 11, to: 20, cursor: true, noun: 'observations' }}
        pageSize={{ value: 10, onChange: () => undefined, options: [5, 10, 20] }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('11–20 observations');
    await userEvent.click(screen.getByRole('combobox', { name: 'Rows per page for observations' }));
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['5', '10', '20']);
  });
});
