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

    const hero = screen.getByRole('banner');
    expect(within(hero).getAllByRole('link', { name: label })[0]).toHaveAttribute('href', href);
  });

  it('names every answer surface in the lead while the rotor cycles', () => {
    render(<LandingPage rotor={<EngineRotor />} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'See how AI and search find you, then fix what holds you back',
    );
    expect(
      screen.getByText(
        'CiteLadder tracks what ChatGPT, Gemini, Claude and Google AI Overviews say',
      ),
    ).toHaveClass('sr-only');
  });

  it('links each pillar module by its published name', () => {
    render(<LandingPage />);

    const pillars = screen.getByRole('region', { name: 'Measure, diagnose, improve' });
    expect(within(pillars).getByRole('link', { name: 'Search Intelligence' })).toHaveAttribute(
      'href',
      '/platform/search-intelligence',
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
