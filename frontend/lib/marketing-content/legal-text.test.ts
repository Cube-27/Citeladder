// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import { legalSections } from './legal-text';

describe('legalSections', () => {
  it('splits headings, paragraphs and bullets into sections', () => {
    expect(
      legalSections(`
## who | Who we are
  First paragraph.
Second paragraph.

## data | Data we hold
- Account details.
- Billing details.
`),
    ).toEqual([
      { id: 'who', title: 'Who we are', paragraphs: ['First paragraph.', 'Second paragraph.'] },
      { id: 'data', title: 'Data we hold', bullets: ['Account details.', 'Billing details.'] },
    ]);
  });

  it('rejects prose that no section owns and malformed headings', () => {
    expect(() => legalSections('Orphan paragraph.\n## who | Who we are')).toThrow(
      /before the first/,
    );
    expect(() => legalSections('## Who we are')).toThrow(/Malformed/);
  });
});
