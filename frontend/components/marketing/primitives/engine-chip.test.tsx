import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EngineChip } from './engine-chip';

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
});
