import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { FlowBlock, FlowPage } from './flow-page';

afterEach(() => vi.unstubAllEnvs());

describe('FlowPage', () => {
  it('links the logo to the website home, offers the theme and closes with its footer', () => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://citeladder.com');
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(
      <FlowPage label="Account access" footer="© CiteLadder">
        <FlowBlock title="Welcome back" after="New here?">
          form
        </FlowBlock>
      </FlowPage>,
    );

    expect(screen.getByRole('link', { name: 'CiteLadder home' })).toHaveAttribute(
      'href',
      'https://citeladder.com/',
    );
    // The link carries the name; the drawn lockup inside it is not announced again.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    const main = screen.getByRole('main', { name: 'Account access' });
    expect(within(main).getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    expect(within(main).getByRole('region', { name: 'Welcome back' })).toHaveTextContent('form');
    expect(main).toHaveTextContent('New here?');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('© CiteLadder');
    // A screen outside the shell names the document after its heading.
    expect(document.title).toBe('Welcome back · CiteLadder');
  });
});
