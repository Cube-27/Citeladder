import { describe, expect, it } from 'vite-plus/test';

import { replaceSection, splitSections } from './sections';

const BODY = [
  'Intro line.',
  '',
  '## Pricing',
  'Old pricing.',
  '```md',
  '## Not a heading',
  '```',
  '',
  '## FAQ',
  'Answers.',
  '',
].join('\n');

describe('output sections', () => {
  it('splits at headings outside code fences and joins back exactly', () => {
    const sections = splitSections(BODY);

    expect(sections.map((section) => section.heading)).toEqual([null, 'Pricing', 'FAQ']);
    expect(sections.map((section) => section.text).join('\n')).toBe(BODY);
  });

  it('replaces one section and keeps the others and their spacing', () => {
    const body = replaceSection(BODY, 1, '## Pricing\nNew pricing.\n\n\n');

    expect(body).toBe(
      ['Intro line.', '', '## Pricing', 'New pricing.', '', '## FAQ', 'Answers.', ''].join('\n'),
    );
  });

  it('keeps leading blank lines with the first titled section', () => {
    expect(splitSections('\n# Title\nText').map((section) => section.heading)).toEqual(['Title']);
  });
});
