// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import {
  moreGuides,
  researchArticle,
  researchFaqs,
  researchParent,
  researchParts,
} from './research-articles';

describe('research guide FAQs', () => {
  it('reads each question and its prose answer as plain text, and stops at the next section', () => {
    const markdown = [
      '## Intro',
      '',
      '### Not a question',
      '',
      'Ignored.',
      '',
      '## Frequently asked questions',
      '',
      '### Is **AEO** the same as GEO?',
      '',
      'Mostly. See the [GEO guide](/generative-engine-optimization).[\\[2\\]](#source-2)',
      'Both describe `answer` work.',
      '',
      '### Does it need a tool?',
      '',
      'No.',
      '',
      '## Sources',
      '',
      '### Not a question either',
    ].join('\n');

    expect(researchFaqs(markdown)).toEqual([
      { q: 'Is AEO the same as GEO?', a: 'Mostly. See the GEO guide. Both describe answer work.' },
      { q: 'Does it need a tool?', a: 'No.' },
    ]);
  });

  it('unwraps a link from its first bracket and keeps malformed brackets as written', () => {
    const markdown = [
      '## Frequently asked questions  ',
      '',
      '### Which [AEO [guide](/aeo) wins?',
      '',
      'Neither [](/empty) nor [blank]() nor [open](/never-closed',
    ].join('\n');

    expect(researchFaqs(markdown)).toEqual([
      {
        q: 'Which AEO [guide wins?',
        a: 'Neither [](/empty) nor [blank]() nor [open](/never-closed',
      },
    ]);
  });

  it('finds the FAQ section when it is the last one in the guide', () => {
    expect(researchFaqs('## Frequently asked questions\n\n### Why?\n\nBecause.\n')).toEqual([
      { q: 'Why?', a: 'Because.' },
    ]);
  });
});

describe('research guide parts', () => {
  it('splits the body, the FAQ, later sections and the numbered sources with their notes', () => {
    const markdown = [
      '## Intro',
      '',
      'Body copy.',
      '',
      '## Frequently asked questions',
      '',
      '### Why track?',
      '',
      'Because answers change.',
      '',
      '## Put the evidence in one place',
      '',
      'Later copy.',
      '',
      '## Sources and review date',
      '',
      'Official pages reviewed 6 October 2026:',
      '',
      '1. <span id="source-1"></span> Google, [Search guide](https://developers.google.com/search), reviewed 6 October 2026.',
      '2. <span id="source-2"></span> [CiteLadder pricing](/pricing).',
    ].join('\n');

    expect(researchParts(markdown)).toEqual({
      body: '## Intro\n\nBody copy.\n\n',
      faq: {
        title: 'Frequently asked questions',
        items: [{ question: 'Why track?', answer: 'Because answers change.' }],
      },
      after: '## Put the evidence in one place\n\nLater copy.\n\n',
      sources: {
        title: 'Sources and review date',
        notes: ['Official pages reviewed 6 October 2026:'],
        items: [
          {
            n: 1,
            markdown:
              'Google, [Search guide](https://developers.google.com/search), reviewed 6 October 2026.',
            href: 'https://developers.google.com/search',
          },
          { n: 2, markdown: '[CiteLadder pricing](/pricing).', href: '/pricing' },
        ],
      },
    });
  });

  it('keeps the whole guide as its body when it has neither a FAQ nor sources', () => {
    expect(researchParts('## Only\n\nCopy.\n')).toEqual({
      body: '## Only\n\nCopy.\n',
      faq: null,
      after: '',
      sources: null,
    });
  });
});

describe('research guide navigation', () => {
  it('files comparison guides under Compare and every other guide under Guides', () => {
    expect(researchParent('/compare/profound-alternatives')).toEqual({
      label: 'Compare',
      href: '/compare',
    });
    expect(researchParent('/blog/geo-vs-seo')).toEqual({ label: 'Guides', href: '/blog' });
  });

  it('never offers a guide as its own "more guides" link', () => {
    for (const path of ['/open-source', '/llm-rank-tracker', '/ai-citation-tracking']) {
      const guide = researchArticle(path)!;
      const slugs = moreGuides(guide).map((more) => more.frontmatter.slug);
      expect(slugs.length, path).toBe(2);
      expect(slugs, path).not.toContain(path);
    }
  });
});
