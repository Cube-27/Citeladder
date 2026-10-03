import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { BillingSupport } from './billing-policies';

afterEach(() => vi.unstubAllEnvs());

it.each(['', 'http://127.0.0.1:3000', 'https://citeladder.com'])(
  'uses the configured marketing origin for billing contact (%s)',
  (origin) => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', origin);
    render(<BillingSupport contact={null} />);
    expect(screen.getByRole('link', { name: 'contact form' })).toHaveAttribute(
      'href',
      origin ? `${origin}/contact` : '/contact',
    );
  },
);
