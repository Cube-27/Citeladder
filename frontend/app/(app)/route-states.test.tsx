import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import AppError from './error';
import AppNotFound from './not-found';

describe('(app) route states', () => {
  it('error.tsx renders the shared empty state and wires its action to reset()', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<AppError error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
    // No correlation reference for a plain error without a digest.
    expect(screen.queryByText(/Support:/)).not.toBeInTheDocument();
  });

  it('error.tsx surfaces the ApiError request id + code for support correlation (A6)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new ApiError('boom', 500, '{}', 'req-abc-123', { code: 'internal_error' });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByText(/code internal_error/)).toBeInTheDocument();
    expect(screen.getByText(/ref req-abc-123/)).toBeInTheDocument();
  });

  it('error.tsx falls back to the Next.js error digest when no request id exists', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('boom'), { digest: '7f3a9c' });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByText(/digest 7f3a9c/)).toBeInTheDocument();
  });

  it('not-found.tsx renders the shared empty state with a way back to the default route', () => {
    render(<AppNotFound />);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
      'href',
      '/visibility',
    );
  });
});
