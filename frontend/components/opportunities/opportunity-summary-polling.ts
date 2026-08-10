import type { OpportunitySummary } from '@/lib/api/types';

export function opportunitySummaryPollingInterval(state: {
  status: string;
  data?: OpportunitySummary;
}): number | false {
  if (state.status === 'error' && !state.data) return false;
  if (state.data?.activation_state === 'ready' || state.data?.activation_state === 'delayed') {
    return false;
  }
  return 1500;
}
