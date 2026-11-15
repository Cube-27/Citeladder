import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { FlowBlock, FlowPage, FlowStep } from './flow-page';

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
  });

  it('names the current step on its rung trail and counts it against the whole flow', () => {
    render(
      <FlowPage label="Project setup" steps={['Basics', 'Research', 'Confirm']} current={1}>
        <FlowStep title="Finding what to track" next={<button type="button">Review</button>}>
          steps
        </FlowStep>
      </FlowPage>,
    );

    const progress = screen.getByRole('region', { name: 'Setup progress' });
    expect(progress).toHaveTextContent('Step 2 of 3');
    expect(within(progress).getByRole('progressbar', { name: 'Research' })).toHaveAttribute(
      'value',
      '2',
    );
    const stepItems = within(progress).getAllByRole('listitem');
    expect(stepItems.map((item) => item.textContent)).toEqual(['Basics', 'Research', 'Confirm']);
    expect(stepItems[1]).toHaveAttribute('aria-current', 'step');
    expect(stepItems[0]).not.toHaveAttribute('aria-current');

    const main = screen.getByRole('main', { name: 'Project setup' });
    expect(within(main).getByRole('region', { name: 'Finding what to track' })).toHaveTextContent(
      'steps',
    );
    expect(within(main).getByRole('button', { name: 'Review' })).toBeVisible();
  });

  it('leaves the rung trail out of a one-screen flow', () => {
    render(
      <FlowPage label="Workspace setup">
        <FlowStep title="Set up your workspace">name</FlowStep>
      </FlowPage>,
    );

    expect(screen.queryByRole('region', { name: 'Setup progress' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Set up your workspace' })).toHaveTextContent('name');
  });
});
