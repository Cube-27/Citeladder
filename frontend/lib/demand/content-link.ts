/** Content receives only the durable Demand signal identifier. */
export const DEMAND_SIGNAL_PARAM = 'demand_signal_id';

export function demandContentHref(signal: { id: string }): string {
  return `/content?${DEMAND_SIGNAL_PARAM}=${encodeURIComponent(signal.id)}`;
}
