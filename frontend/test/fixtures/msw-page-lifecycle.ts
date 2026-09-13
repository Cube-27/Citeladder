import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import { mswServer } from '@/test/msw-server';

/** Shared isolation contract for page fixtures that own the MSW lifecycle. */
export function setupMswPageTests(resetNavigation: () => void) {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    window.localStorage?.clear();
    resetNavigation();
  });
  afterEach(() => {
    mswServer.resetHandlers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(() => mswServer.close());
}
