import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { span: 'span' },
  useReducedMotion: () => false,
}));

import { RotatingEngineLabel } from './rotating-engine-label';

describe('RotatingEngineLabel', () => {
  afterEach(() => vi.useRealTimers());

  it('cycles through ChatGPT, Claude, and Gemini in order', () => {
    vi.useFakeTimers();
    const { container } = render(<RotatingEngineLabel />);
    const stableLabel = container.firstElementChild;

    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(container.querySelector('[data-engine-logo="openai"]')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(container.querySelector('[data-engine-logo="claude"]')).toBeInTheDocument();
    expect(container.firstElementChild).toBe(stableLabel);

    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(container.querySelector('[data-engine-logo="gemini"]')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
  });
});
