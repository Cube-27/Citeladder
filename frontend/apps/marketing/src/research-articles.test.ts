// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import { moreGuides, researchArticle, researchFaqs, researchParent } from './research-articles';

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
