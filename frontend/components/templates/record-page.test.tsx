import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { renderWithProviders } from '@/test/render';

import { RecordPage } from './record-page';

const masthead = () => document.querySelector<HTMLElement>('[data-masthead]')!;
const body = () => document.querySelector<HTMLElement>('[data-page-body]')!;

describe('RecordPage', () => {
  it('trails a record to its route collection in the masthead and names it in the h1 above the body', async () => {
    renderWithProviders(
      <RecordPage title="Nov 18 run">
        <p>Body</p>
      </RecordPage>,
      { initialEntries: ['/runs/run-1'] },
    );

    const trail = await within(masthead()).findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Runs' }).getAttribute('href')).toMatch(
      /^\/runs/,
    );
    expect(within(trail).getByText('Nov 18 run').closest('li')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Nov 18 run');
    expect(masthead()).not.toContainElement(heading);
    expect(heading.compareDocumentPosition(body()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole('link', { name: /back/i })).not.toBeInTheDocument();
  });

  it('keeps a top-level page title in the masthead with no trail', async () => {
    renderWithProviders(
      <RecordPage>
        <p>Body</p>
      </RecordPage>,
      { initialEntries: ['/runs'] },
    );

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Runs');
    expect(masthead()).toContainElement(heading);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('pads the document scroller to clear the action bar only while the bar shows', async () => {
    const root = document.documentElement;
    const { rerender, unmount } = renderWithProviders(
      <RecordPage title="Fix links" actionBar={<button type="button">Reopen</button>}>
        <p>Body</p>
      </RecordPage>,
    );
    await screen.findByRole('button', { name: 'Reopen' });
    expect(root.style.getPropertyValue('scroll-padding-bottom')).toBe(
      'calc(var(--filter-bar-height) + 2 * var(--content-gutter))',
    );

    rerender(
      <RecordPage title="Fix links">
        <p>Body</p>
      </RecordPage>,
    );
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    expect(root.style.getPropertyValue('scroll-padding-bottom')).toBe('');
    unmount();
  });
});
