import { expect, it } from 'vite-plus/test';

import { runStepLabel } from './vocabulary';

it('keeps processing, failed, unknown and planned progress distinct', () => {
  const labels = ['processing', 'failed', 'new_status', 'reasoned'].map((status) =>
    runStepLabel({ status, tool: null }),
  );
  expect(new Set(labels).size).toBe(labels.length);
  // An unknown read outcome never reads as a completed one.
  expect(runStepLabel({ status: 'new_status', tool: 'read_site_health' })).not.toBe(
    runStepLabel({ status: 'completed', tool: 'read_site_health' }),
  );
});
