import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { focusByKeyboard } from '@/test/keyboard-focus';
import { emitResize } from '@/test/resize-observer';

import { Button } from './button';
import { Masthead } from './masthead';
import { MastheadPrimary } from './masthead-actions';

const TITLE = 'https://www.example.com/blog/how-to-choose-a-crm-for-a-small-agency';

describe('Masthead', () => {
  it('lets a cut title take focus and shows the full title in its tooltip', async () => {
    render(<Masthead title={TITLE} />);
    const heading = screen.getByRole('heading', { level: 1, name: TITLE });
    expect(heading).not.toHaveAttribute('tabindex');

    // One line: the title is cut along its width, never wrapped to a second row.
    Object.defineProperty(heading, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(heading, 'scrollWidth', { configurable: true, value: 640 });
    act(() => emitResize(heading));
    expect(heading).toHaveAttribute('tabindex', '0');

    focusByKeyboard(heading);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(TITLE);
  });

  it('keeps the primary action beside the title and folds the secondary ones behind More actions', async () => {
    const { rerender } = render(
      <Masthead
        title="Website"
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
    const more = await screen.findByRole('button', { name: 'More actions' });
    const group = document.getElementById(more.getAttribute('aria-controls') ?? '')!;
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Crawl schedule', 'Export']);
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

    // One secondary action has nothing to fold: it stays in the row.
    rerender(<Masthead title="Website" actions={<Button>Export</Button>} />);
    expect(await screen.findByRole('button', { name: 'Export' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});
