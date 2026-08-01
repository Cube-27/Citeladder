import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RotatingEngineLogos } from './rotating-engine-logos';

describe('RotatingEngineLogos', () => {
  it('renders the three shipped and three planned providers in fixed slots', () => {
    const { container } = render(<RotatingEngineLogos />);

    expect(container.querySelectorAll('[data-logo-slot]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-logo-face="primary"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-logo-face="alternate"]')).toHaveLength(3);
  });

  // Keeping the planned logos is an approved deviation from the "no provider
  // logo without a shipped adapter" gate. These assertions ARE the replacement
  // gate: present, labelled coming-soon, and not connectable.
  it('labels every planned provider coming soon, visibly', () => {
    const { container } = render(<RotatingEngineLogos />);

    const planned = container.querySelectorAll('[data-logo-face="alternate"]');
    expect(planned).toHaveLength(3);
    for (const face of planned) {
      expect(within(face as HTMLElement).getByText('Coming soon')).toBeInTheDocument();
    }

    // The shipped faces carry no such qualifier.
    for (const face of container.querySelectorAll('[data-logo-face="primary"]')) {
      expect(within(face as HTMLElement).queryByText('Coming soon')).toBeNull();
    }
  });

  it('distinguishes the two groups in the accessible name', () => {
    render(<RotatingEngineLogos />);

    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toBe(
      'Available: ChatGPT, Gemini and Claude. Coming soon: Grok, Copilot and Perplexity.',
    );
    // Naming a provider is allowed; claiming it is measured today is not.
    expect(label).not.toMatch(/monitor|audit|track|cover/i);
  });

  it('makes no mark a link or a connect affordance', () => {
    const { container } = render(<RotatingEngineLogos />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
