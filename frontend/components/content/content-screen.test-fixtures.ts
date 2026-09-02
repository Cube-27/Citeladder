import type { ContentSkillView } from '@/lib/api/content';

/** A bounded stand-in for the server-owned skill catalog. */
function skill(
  id: string,
  label: string,
  description: string,
  channel: ContentSkillView['channel'] = 'web',
): ContentSkillView {
  return {
    id,
    label,
    channel,
    description,
  };
}

export const contentSkillCatalogFixture = {
  version: 'content-skills-v5',
  default_skill_id: 'content_page',
  skills: [
    skill('content_page', 'Website content page', 'A publish-ready page spec.'),
    skill('about_us', 'About Us page', 'A factual canonical company profile.'),
    skill('article', 'Article', 'Authoritative long-form piece.'),
    skill('blog', 'Blog post', 'Answer-first post with worked examples.'),
    skill('linkedin', 'LinkedIn post', 'Professional post carrying one idea.', 'social'),
  ],
};
