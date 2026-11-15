import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { focusByKeyboard } from '@/test/keyboard-focus';
import { emitResize } from '@/test/resize-observer';

import { Button } from './button';
import { Masthead } from './masthead';
import { MastheadPrimary } from './masthead-actions';

function EmptyEnd() {
  return null;
}

const TITLE = 'https://www.example.com/blog/how-to-choose-a-crm-for-a-small-agency';

describe('Masthead', () => {
  it('lets a cut title take focus and shows the full title in its tooltip', async () => {
    render(<Masthead title={TITLE} />);
    const heading = screen.getByRole('heading', { level: 1, name: TITLE });
    expect(heading).not.toHaveAttribute('tabindex');

    // A title longer than its box is cut (one line from `rail`, two below it).
    Object.defineProperty(heading, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(heading, 'scrollWidth', { configurable: true, value: 640 });
    act(() => emitResize(heading));
    expect(heading).toHaveAttribute('tabindex', '0');

    focusByKeyboard(heading);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(TITLE);
  });

  it('keeps the primary action beside the title and folds the rest behind More', async () => {
    const { rerender } = render(
      <Masthead
        title="Website"
        search={<Button>Search</Button>}
        end={<Button>Ask agent</Button>}
        actions={
          <>
            <Button>Crawl schedule</Button>
            <Button>Export</Button>
            <MastheadPrimary>
              <Button variant="primary">Run new crawl</Button>
            </MastheadPrimary>
          </>
        }
      />,
    );
    const more = await screen.findByRole('button', { name: 'More' });
    const group = document.getElementById(more.getAttribute('aria-controls') ?? '')!;
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Search', 'Crawl schedule', 'Export', 'Ask agent']);
    const primary = screen.getByRole('button', { name: 'Run new crawl' });
    expect(group).not.toContainElement(primary);
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(within(group).getByRole('button', { name: 'Export' }), { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();

    fireEvent.click(more);
    fireEvent.click(within(group).getByRole('button', { name: 'Export' }));
    expect(more).toHaveAttribute('aria-expanded', 'false');

    // One control has nothing to fold: it stays in the row. An end that drew
    // nothing (no "Ask agent" on an Agent page) is not counted.
    rerender(<Masthead title="Website" actions={<Button>Export</Button>} end={<EmptyEnd />} />);
    expect(await screen.findByRole('button', { name: 'Export' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });
});
