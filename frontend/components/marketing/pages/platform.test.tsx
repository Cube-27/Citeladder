import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { PlatformActions } from './platform';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['/platform', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['/platform/ai-visibility', false, 'Book a demo', '/contact'],
  ['/platform/agents', true, 'Book a demo', '/contact'],
  ['/platform/content-intelligence', true, 'Book a demo', '/contact'],
  ['/platform/mcp', true, 'Read setup guide', 'https://docs.citeladder.com/mcp/'],
] as const)('routes %s actions with signup enabled=%s', (path, enabled, label, href) => {
  vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', String(enabled));
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
  render(<PlatformActions path={path} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  if (label !== 'Start free trial') {
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  }
});

it('links the Agent closing action to its content workflow', () => {
  render(<PlatformActions path="/platform/agents" closing />);
  expect(screen.getByRole('link', { name: 'Explore Content Intelligence' })).toHaveAttribute(
    'href',
    '/platform/content-intelligence',
  );
});
