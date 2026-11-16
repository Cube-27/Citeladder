import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { renderWithProviders } from '@/test/render';

import { RecordPage } from './record-page';

const BACK = { href: '/agent/actions', label: 'Actions' };

describe('RecordPage', () => {
  it('pads the document scroller to clear the action bar only while the bar shows', async () => {
    const root = document.documentElement;
    const { rerender, unmount } = renderWithProviders(
      <RecordPage back={BACK} title="Fix links" actionBar={<button type="button">Reopen</button>}>
        <p>Body</p>
      </RecordPage>,
    );
    await screen.findByRole('button', { name: 'Reopen' });
    expect(root.style.getPropertyValue('scroll-padding-bottom')).toBe(
      'calc(var(--filter-bar-height) + 2 * var(--content-gutter))',
    );

    rerender(
      <RecordPage back={BACK} title="Fix links">
        <p>Body</p>
      </RecordPage>,
    );
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    expect(root.style.getPropertyValue('scroll-padding-bottom')).toBe('');
    unmount();
  });
});
