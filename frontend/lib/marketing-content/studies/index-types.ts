import type { PageRecord } from '../pages';

export type StudyIndex = PageRecord &
  Readonly<{
    heroTitle: string;
    lead: string;
    groups: readonly Readonly<{ title: string; description: string }>[];
  }>;
