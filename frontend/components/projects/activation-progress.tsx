import { type ActivityStep, type ActivityStepState } from '@/components/ui/activity-progress';

const CRAWL_TERMINAL = new Set(['completed', 'partially_completed', 'failed', 'cancelled']);
const CRAWL_UNSUCCESSFUL = new Set(['failed', 'cancelled']);

type ActivationFacts = {
  pageLimit: number | null;
  crawl?: {
    status: string;
    discovery_status: string;
    visible_url_count: number;
    analyzed_count: number;
  };
  recommendationState: 'waiting_for_evidence' | 'queued' | 'refreshing' | 'ready' | 'delayed';
};

export function recommendationPollingInterval(
  crawlUnsuccessful: boolean,
  state: ActivationFacts['recommendationState'] | undefined,
): number | false {
  if (crawlUnsuccessful || state === 'ready' || state === 'delayed') return false;
  return 1500;
}

function pageReviewLabel(pageLimit: number | null): string {
  if (pageLimit) return `Reviewing up to ${pageLimit} useful pages`;
  return 'Reviewing useful pages';
}

function pageStepState(
  crawlUnsuccessful: boolean,
  discoveryComplete: boolean,
  crawlTerminal: boolean,
): ActivityStepState {
  if (crawlUnsuccessful && !discoveryComplete) return 'attention';
  if (discoveryComplete || crawlTerminal) return 'complete';
  return 'active';
}

function analyzedPageDetail(crawl: ActivationFacts['crawl'], crawlUnsuccessful: boolean) {
  if (crawlUnsuccessful) return 'The website review needs attention.';
  if (!crawl || crawl.analyzed_count === 0) return undefined;
  const noun = crawl.analyzed_count === 1 ? 'page' : 'pages';
  return `${crawl.analyzed_count} ${noun} checked`;
}

function clarityStepState(
  crawlUnsuccessful: boolean,
  crawlTerminal: boolean,
  discoveryComplete: boolean,
): ActivityStepState {
  if (crawlUnsuccessful) return 'attention';
  if (crawlTerminal) return 'complete';
  if (discoveryComplete) return 'active';
  return 'pending';
}

function recommendationStepState(
  ready: boolean,
  delayed: boolean,
  crawlTerminal: boolean,
  crawlUnsuccessful: boolean,
): ActivityStepState {
  if (ready) return 'complete';
  if (delayed) return 'attention';
  if (crawlTerminal && !crawlUnsuccessful) return 'active';
  return 'pending';
}

export function activationSteps({
  pageLimit,
  crawl,
  recommendationState,
}: ActivationFacts): ActivityStep[] {
  const crawlTerminal = Boolean(crawl && CRAWL_TERMINAL.has(crawl.status));
  const crawlUnsuccessful = Boolean(crawl && CRAWL_UNSUCCESSFUL.has(crawl.status));
  const discoveryComplete = Boolean(
    crawl && ['completed', 'sample_completed'].includes(crawl.discovery_status),
  );
  const ready = recommendationState === 'ready';
  const delayed = recommendationState === 'delayed';

  return [
    { id: 'project', label: 'Project created', state: 'complete' },
    {
      id: 'pages',
      label: pageReviewLabel(pageLimit),
      detail: crawl ? `${crawl.visible_url_count} useful pages found` : undefined,
      state: pageStepState(crawlUnsuccessful, discoveryComplete, crawlTerminal),
    },
    {
      id: 'clarity',
      label: 'Checking how clearly pages explain the business',
      detail: analyzedPageDetail(crawl, crawlUnsuccessful),
      state: clarityStepState(crawlUnsuccessful, crawlTerminal, discoveryComplete),
    },
    {
      id: 'recommendations',
      label: 'Prioritizing recommendations',
      state: recommendationStepState(ready, delayed, crawlTerminal, crawlUnsuccessful),
      detail: delayed ? 'This is taking longer than expected.' : undefined,
    },
    { id: 'ready', label: 'Ready', state: ready ? 'complete' : 'pending' },
  ];
}
