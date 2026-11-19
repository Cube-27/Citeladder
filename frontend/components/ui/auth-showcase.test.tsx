import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { AuthShowcase } from './auth-showcase';

function preferReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The one slide assistive technology can reach: hidden slides are aria-hidden. */
function shownSlide() {
  return screen.getByRole('region', { name: /of 3:/ });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AuthShowcase', () => {
  it('shows the feature whose dot is pressed and marks that dot current', () => {
    preferReducedMotion(false);
    render(<AuthShowcase />);

    expect(shownSlide()).toHaveAccessibleName('1 of 3: Connect MCP');
    fireEvent.click(screen.getByRole('button', { name: 'Site Health' }));

    expect(shownSlide()).toHaveAccessibleName('3 of 3: Site Health');
    expect(shownSlide()).toHaveTextContent(
      'Site Health crawls your site and checks indexing, structured data and AI crawler access.',
    );
    expect(screen.getByRole('button', { name: 'Site Health' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Connect MCP' })).not.toHaveAttribute('aria-current');
  });

  it('turns to the next feature on its own, and holds while hovered', () => {
    preferReducedMotion(false);
    render(<AuthShowcase />);
    const carousel = screen.getByRole('complementary', { name: 'CiteLadder features' });

    wait(7000);
    expect(shownSlide()).toHaveAccessibleName('2 of 3: Keyword Research');

    fireEvent.pointerEnter(carousel);
    wait(21000);
    expect(shownSlide()).toHaveAccessibleName('2 of 3: Keyword Research');

    fireEvent.pointerLeave(carousel);
    wait(7000);
    expect(shownSlide()).toHaveAccessibleName('3 of 3: Site Health');
  });

  it('holds while a control inside it has keyboard focus', () => {
    preferReducedMotion(false);
    render(<AuthShowcase />);
    const dot = screen.getByRole('button', { name: 'Connect MCP' });

    act(() => dot.focus());
    wait(21000);
    expect(shownSlide()).toHaveAccessibleName('1 of 3: Connect MCP');

    act(() => dot.blur());
    wait(7000);
    expect(shownSlide()).toHaveAccessibleName('2 of 3: Keyword Research');
  });

  it('stops turning when paused and turns again when played', () => {
    preferReducedMotion(false);
    render(<AuthShowcase />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause slides' }));
    wait(21000);
    expect(shownSlide()).toHaveAccessibleName('1 of 3: Connect MCP');

    fireEvent.click(screen.getByRole('button', { name: 'Play slides' }));
    wait(7000);
    expect(shownSlide()).toHaveAccessibleName('2 of 3: Keyword Research');
  });

  it('never turns on its own under reduced motion, and offers no pause control', () => {
    preferReducedMotion(true);
    render(<AuthShowcase />);

    wait(30000);

    expect(shownSlide()).toHaveAccessibleName('1 of 3: Connect MCP');
    expect(screen.queryByRole('button', { name: 'Pause slides' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keyword Research' }));
    expect(shownSlide()).toHaveAccessibleName('2 of 3: Keyword Research');
  });
});
