/** Bounds for the independent lease-recovery process and one-shot worker drains. */
export const queueRecovery = {
  batchSize: 500,
  pollSeconds: 30,
  drainBudgetSeconds: 300,
};
