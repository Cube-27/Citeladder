import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { PlatformActions } from './platform';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['trial', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['trial', false, 'Book a demo', '/contact'],
  ['demo', true, 'Book a demo', '/contact'],
  ['setup', true, 'Discuss setup', '/contact'],
  ['mcp', true, 'Read setup guide', 'https://docs.citeladder.com/mcp/'],
] as const)('leads %s pages with signup enabled=%s', (cta, enabled, label, href) => {
  vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', String(enabled));
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
  render(<PlatformActions cta={cta} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  if (label !== 'Start free trial') {
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  }
});
