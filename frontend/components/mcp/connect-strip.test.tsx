import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vite-plus/test';

import { ConnectStrip } from './connect-strip';

it('connects Claude with the CiteLadder URL already filled in', () => {
  render(<ConnectStrip />);
  const connect = screen.getByRole('link', { name: 'Connect to Claude' });
  expect(connect).toHaveAttribute(
    'href',
    'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=CiteLadder&connectorUrl=https%3A%2F%2Fciteladder.com%2Fmcp',
  );
  expect(connect).toHaveAttribute('target', '_blank');
});

it('offers the other assistants from the keyboard and copies the URL to paste there', async () => {
  const user = userEvent.setup();
  render(<ConnectStrip />);
  await user.tab();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Connect another assistant' })).toHaveFocus();
  await user.keyboard('{Enter}');
  const items = screen.getAllByRole('menuitem');
  expect(items.map((item) => item.textContent)).toEqual(['ChatGPT', 'Gemini', 'Grok']);

  await user.click(screen.getByRole('menuitem', { name: 'ChatGPT' }));
  expect(await navigator.clipboard.readText()).toBe('https://citeladder.com/mcp');
  expect(screen.getByRole('status')).toHaveTextContent(
    'URL copied. In ChatGPT, add a custom connector and paste it.',
  );
});

it('opens the assistant menu on hover', async () => {
  const user = userEvent.setup();
  render(<ConnectStrip />);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.hover(screen.getByRole('link', { name: 'Connect to Claude' }));
  expect(screen.getByRole('menuitem', { name: 'Gemini' })).toHaveAttribute(
    'href',
    'https://gemini.google.com/apps',
  );
});
