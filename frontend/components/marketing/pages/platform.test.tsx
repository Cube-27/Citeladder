import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { PlatformActions } from './platform';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['trial', true, 'Start free trial', 'https://app.citeladder.com/register'],
  ['trial', false, 'Book a demo', '/contact'],
  ['demo', true, 'Book a demo', '/contact'],
  ['setup', true, 'Discuss setup', '/contact'],
] as const)('leads %s pages with signup enabled=%s', (cta, enabled, label, href) => {
  vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', String(enabled));
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
  render(<PlatformActions cta={cta} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  if (label !== 'Start free trial') {
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  }
});

it('leads the MCP page with the connect strip instead of the guide and demo', () => {
  render(<PlatformActions cta="mcp" />);
  expect(screen.getByRole('link', { name: 'Connect to Claude' })).toHaveAttribute(
    'href',
    'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=CiteLadder&connectorUrl=https%3A%2F%2Fciteladder.com%2Fmcp',
  );
  expect(screen.queryByRole('link', { name: 'Book a demo' })).not.toBeInTheDocument();
});

it('closes the MCP page with the setup guide and a demo instead of a second strip', () => {
  render(<PlatformActions cta="mcp" closing />);
  expect(screen.getByRole('link', { name: 'Read the MCP docs' })).toHaveAttribute(
    'href',
    'https://docs.citeladder.com/mcp/',
  );
  expect(screen.getByRole('link', { name: 'Book a demo' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Connect to Claude' })).not.toBeInTheDocument();
});
