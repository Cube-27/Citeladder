import { act, render, screen } from '@testing-library/react';
import { memo } from 'react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { useAdaptiveThrottle } from './use-adaptive-throttle';

afterEach(() => {
  vi.useRealTimers();
});

const PACE = { floor: 50, cap: 250 };
/** How long painting each value takes. */
const COST: Record<string, number> = { slow: 80, slower: 200 };

/** Memoized, so it renders, and spends its cost, only when the shown value changes. */
const Painted = memo(function Painted({ text }: Readonly<{ text: string }>) {
  vi.setSystemTime(Number(vi.getMockedSystemTime()) + (COST[text] ?? 0));
  return <output>{text}</output>;
});

function Host({ value }: Readonly<{ value: string }>) {
  return <Painted text={useAdaptiveThrottle(value, PACE)} />;
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

it('waits twice the last repaint before the next one, within the floor and the cap', () => {
  vi.useFakeTimers();
  const { rerender } = render(<Host value="start" />);
  advance(100);

  // A cheap repaint keeps the floor.
  rerender(<Host value="cheap" />);
  advance(0);
  expect(screen.getByRole('status')).toHaveTextContent('cheap');
  rerender(<Host value="slow" />);
  advance(49);
  expect(screen.getByRole('status')).toHaveTextContent('cheap');
  advance(1); // The slow repaint takes 80 ms.

  // 160 ms after the slow repaint began, 80 of which it spent painting.
  rerender(<Host value="next" />);
  advance(79);
  expect(screen.getByRole('status')).toHaveTextContent('slow');
  advance(1);
  expect(screen.getByRole('status')).toHaveTextContent('next');

  // The cheap repaint brings the wait back to the floor.
  rerender(<Host value="slower" />);
  advance(49);
  expect(screen.getByRole('status')).toHaveTextContent('next');
  advance(1); // The slower repaint takes 200 ms: twice that is past the cap.

  rerender(<Host value="last" />);
  advance(49);
  expect(screen.getByRole('status')).toHaveTextContent('slower');
  advance(1);
  expect(screen.getByRole('status')).toHaveTextContent('last');
});
