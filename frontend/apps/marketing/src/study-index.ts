import type { StudyIndex } from '@/lib/marketing-content/studies/index-types';
import { studyPagesUnder } from './research-articles';

export function studyGroups(index: StudyIndex, prefix: string) {
  const pages = studyPagesUnder(prefix);
  const unknown = pages.filter(
    ({ frontmatter }) => !index.groups.some((group) => group.title === frontmatter.index_group),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Study pages without a known index_group: ${unknown.map(({ frontmatter }) => frontmatter.slug).join(', ')}`,
    );
  }
  return index.groups.map((group) => {
    const items = pages
      .filter(({ frontmatter }) => frontmatter.index_group === group.title)
      .map(({ frontmatter }) => ({
        title: frontmatter.title,
        href: frontmatter.slug,
        body: frontmatter.meta_description,
        meta: frontmatter.index_meta,
      }));
    return { title: group.title, description: group.description, items };
  });
}
