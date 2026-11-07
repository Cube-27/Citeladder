// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import { STUDY_INDEXES } from '@/lib/marketing-content/studies/indexes';
import { studyPagesUnder } from './research-articles';
import { studyGroups } from './study-index';

describe('study section indexes', () => {
  it('lists every study page of each section under one of that index groups', () => {
    for (const index of Object.values(STUDY_INDEXES)) {
      const prefix = `${index.path}/`;
      const listed = studyGroups(index, prefix)
        .flatMap((group) => group.items.map((item) => item.href))
        .sort();
      const pages = studyPagesUnder(prefix)
        .map(({ frontmatter }) => frontmatter.slug)
        .sort();
      expect(pages.length, index.path).toBeGreaterThan(0);
      expect(listed, index.path).toEqual(pages);
    }
  });

  it('names the pages whose index_group the index does not have', () => {
    const research = { ...STUDY_INDEXES.research, groups: [] };
    expect(() => studyGroups(research, '/research/')).toThrow(
      /Study pages without a known index_group: .*\/research\/ai-crawlers-robots-txt-2026/u,
    );
  });
});
