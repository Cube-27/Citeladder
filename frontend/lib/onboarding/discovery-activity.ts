import type { ActivityStep } from '@/components/ui/activity-progress';
import type { BrandDiscovery } from '@/lib/api/brand-discoveries';

type DiscoveryPhase = BrandDiscovery['progress']['phase'];

const PHASE_INDEX: Record<DiscoveryPhase, number> = {
  opening_website: 0,
  understanding_business: 1,
  finding_competitors: 2,
  building_questions: 3,
  preparing_review: 4,
  complete: 5,
};

/**
 * Convert persisted discovery facts into customer language. Unknown backend
 * details never become a copy fallback; adding a phase must be handled here.
 */
export function discoveryActivity(discovery: BrandDiscovery | undefined): ActivityStep[] {
  const current = discovery
    ? discovery.status === 'ready' ||
      discovery.status === 'confirmed' ||
      discovery.status === 'project_created'
      ? 5
      : PHASE_INDEX[discovery.progress.phase]
    : 0;
  const progress = discovery?.progress;
  const labels = [
    'Opening your website',
    'Understanding what you offer',
    'Finding comparable brands',
    'Building balanced questions',
    'Preparing your review',
  ] as const;
  const details = [
    progress && progress.pages_read > 0
      ? `${progress.pages_read} useful ${progress.pages_read === 1 ? 'page' : 'pages'} read`
      : undefined,
    undefined,
    progress && progress.competitors_found > 0
      ? `${progress.competitors_found} comparable ${progress.competitors_found === 1 ? 'brand' : 'brands'} found`
      : undefined,
    progress && progress.prompts_prepared > 0
      ? `${progress.prompts_prepared} balanced ${progress.prompts_prepared === 1 ? 'question' : 'questions'} prepared`
      : undefined,
    undefined,
  ] as const;

  return labels.map((label, index) => ({
    id: label,
    label,
    detail: details[index],
    state:
      index < current
        ? 'complete'
        : index === current
          ? discovery?.status === 'needs_input'
            ? 'attention'
            : 'active'
          : 'pending',
  }));
}
