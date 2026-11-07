import type { PageRecord } from '../pages';

/**
 * A study section's index page (/ai-crawlers, /research): its page record plus
 * the hero copy and the order and descriptions of the groups it lists. The
 * values live in `indexes.ts`, written from the study pipeline's reviewed drafts.
 */
export type StudyIndex = PageRecord &
  Readonly<{
    heroTitle: string;
    lead: string;
    groups: readonly Readonly<{ title: string; description: string }>[];
  }>;
