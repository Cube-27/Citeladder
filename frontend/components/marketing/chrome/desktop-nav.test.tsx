import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';

import { DesktopNav } from './desktop-nav';

describe('DesktopNav', () => {
  it('opens a menu on a click and closes it on a second click', async () => {
    const user = userEvent.setup();
    render(<DesktopNav path="/" />);
    const platform = screen.getByRole('button', { name: 'Platform' });

    await user.click(platform);
    expect(platform).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /AI Visibility/ })).toHaveAttribute(
      'href',
      '/platform/ai-visibility',
    );

    await user.click(platform);
    expect(platform).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /AI Visibility/ })).not.toBeInTheDocument();
  });

  it('swaps the open menu in place when another trigger is chosen', async () => {
    const user = userEvent.setup();
    render(<DesktopNav path="/" />);

    await user.click(screen.getByRole('button', { name: 'Platform' }));
    await user.click(screen.getByRole('button', { name: 'Solutions' }));

    expect(screen.getByRole('button', { name: 'Platform' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: /Agencies/ })).toHaveAttribute(
      'href',
      '/solutions#agencies',
    );
    expect(screen.queryByRole('link', { name: /AI Visibility/ })).not.toBeInTheDocument();
  });

  it('closes on Escape from a row and hands focus back to its trigger', async () => {
    const user = userEvent.setup();
    render(<DesktopNav path="/" />);
    const resources = screen.getByRole('button', { name: 'Resources' });

    resources.focus();
    await user.keyboard('{Enter}');
    expect(resources).toHaveAttribute('aria-expanded', 'true');
    screen.getByRole('link', { name: /FAQ/ }).focus();
    await user.keyboard('{Escape}');

    expect(resources).toHaveAttribute('aria-expanded', 'false');
    expect(resources).toHaveFocus();
  });

  it('moves between the top-level items with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<DesktopNav path="/" />);

    screen.getByRole('button', { name: 'Platform' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Solutions' })).toHaveFocus();
  });

  it('marks the current page on its top-level link and on its menu row', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DesktopNav path="/enterprise" />);
    expect(screen.getByRole('link', { name: 'Enterprise' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Resources' })).not.toHaveAttribute('data-current');
    unmount();

    const listed = render(<DesktopNav path="/open-source" />);
    expect(screen.getByRole('button', { name: 'Resources' })).toHaveAttribute('data-current', '');
    expect(screen.getByRole('button', { name: 'Platform' })).not.toHaveAttribute('data-current');
    listed.unmount();

    for (const path of [
      '/ai-crawlers/gptbot',
      '/claude-recommendations',
      '/best-ai-visibility-platforms',
    ]) {
      const page = render(<DesktopNav path={path} />);
      expect(screen.getByRole('button', { name: 'Resources' })).toHaveAttribute('data-current', '');
      page.unmount();
    }

    render(<DesktopNav path="/platform/mcp" />);
    await user.click(screen.getByRole('button', { name: 'Platform' }));
    const connect = screen.getByRole('list', { name: 'Improve & connect' });
    expect(within(connect).getByRole('link', { name: /MCP/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
