import { describe, expect, it } from 'vitest';

import { normalizeEvidenceMarkdown } from './evidence-card';

describe('normalizeEvidenceMarkdown', () => {
  it('rejoins citation-split list sentences without flattening real Markdown blocks', () => {
    const response = [
      'Here is the landscape:',
      '**Catalog tools**',
      '- Bloomreach helped a retailer described as',
      "the UK's leading retailer with 27,000+ SKUs",
      ', restructure its catalog, delivering a',
      '+21% increase in AOV',
      '.',
      '- Width.ai focuses on product data.',
    ].join('\n\n');

    expect(normalizeEvidenceMarkdown(response)).toBe(
      [
        'Here is the landscape:',
        '**Catalog tools**',
        "- Bloomreach helped a retailer described as the UK's leading retailer with 27,000+ SKUs, restructure its catalog, delivering a +21% increase in AOV.",
        '- Width.ai focuses on product data.',
      ].join('\n\n'),
    );
  });
});
