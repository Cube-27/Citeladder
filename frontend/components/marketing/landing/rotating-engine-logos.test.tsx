import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RotatingEngineLogos } from './rotating-engine-logos';

describe('RotatingEngineLogos', () => {
  it('discloses the brand roster without status labels or connect affordances', () => {
    render(<RotatingEngineLogos />);
    const roster = screen.getByRole('img');

    expect(roster).toHaveAccessibleName('ChatGPT, Grok, Gemini, Copilot, Claude and Perplexity.');
    expect(screen.queryByText(/available|coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
