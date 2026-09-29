import { expect, it } from 'vite-plus/test';

import { runStepLabel } from './vocabulary';

it('keeps processing, failed and unknown progress distinct from planned work', () => {
  expect(runStepLabel({ status: 'processing', tool: null })).toBe('Processing the next step…');
  expect(runStepLabel({ status: 'failed', tool: null })).toBe('Step failed');
  expect(runStepLabel({ status: 'new_status', tool: null })).toBe('Step status unknown');
  expect(runStepLabel({ status: 'new_status', tool: 'read_site_health' })).toContain(
    'status unknown',
  );
  expect(runStepLabel({ status: 'reasoned', tool: null })).toBe('Planned the next step');
});
