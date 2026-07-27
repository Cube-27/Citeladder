import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ENGINE_KEYS, EngineChip } from './engine-chip';

describe('EngineChip', () => {
  it('uses official marks for every audited engine', () => {
    const { container } = render(
      <div>
        <EngineChip engine="openai" />
        <EngineChip engine="gemini" />
        <EngineChip engine="claude" />
      </div>,
    );

    expect(container.querySelector('[data-engine-logo="openai"]')).toBeInTheDocument();
    expect(container.querySelector('[data-engine-logo="gemini"]')).toBeInTheDocument();
    expect(container.querySelector('[data-engine-logo="claude"]')).toBeInTheDocument();
  });

  it('pins the audited roster to exactly the three approved engines', () => {
    // One approved transport per engine (provider_catalog.py APPROVED_ROUTES).
    expect(ENGINE_KEYS).toEqual(['openai', 'gemini', 'claude']);
  });
});
