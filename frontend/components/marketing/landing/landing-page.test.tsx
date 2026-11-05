import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { LandingPage } from './landing-page';
import { EngineRotor } from './landing-rotor';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LandingPage', () => {
  it.each([
    ['true', 'Start free trial', 'https://app.citeladder.com/register'],
    ['false', 'Book a demo', '/contact'],
  ])('routes the hero action with self-serve signup %s', (enabled, label, href) => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<LandingPage />);

    // The hero's action is the first one on the page; the closing band repeats it.
    expect(screen.getAllByRole('link', { name: label })[0]).toHaveAttribute('href', href);
  });

  it('opens on the MCP announcement above the headline', () => {
    render(<LandingPage />);

    const [announcement] = screen.getAllByRole('link');
    expect(announcement).toHaveAccessibleName('New Connect CiteLadder to Claude, ChatGPT and more');
    expect(announcement).toHaveAttribute('href', '/platform/mcp');
  });

  it('names every answer surface in the lead while the rotor cycles', () => {
    render(<LandingPage rotor={<EngineRotor />} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'See whether AI recommends you, and what to fix when it does not',
    );
    expect(
      screen.getByText(
        'CiteLadder is the tool you use when you want ChatGPT, Gemini, Claude and Google AI Overviews to recommend your business',
      ),
    ).toHaveClass('sr-only');
  });

  it('links each pillar module by its published name', () => {
    render(<LandingPage />);

    const pillars = screen.getByRole('region', { name: 'Measure, diagnose, improve' });
    expect(within(pillars).getByRole('link', { name: 'Keyword Research' })).toHaveAttribute(
      'href',
      '/platform/keyword-research',
    );
    expect(within(pillars).getByRole('link', { name: 'MCP' })).toHaveAttribute(
      'href',
      '/platform/mcp',
    );
  });

  it('labels API collection apart from consumer answer surfaces', () => {
    render(<LandingPage />);

    const engines = screen.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['OpenAI API', 'Gemini API', 'Claude API', 'Google AI Overviews']) {
      expect(within(engines).getByText(name)).toBeVisible();
    }
  });
});
