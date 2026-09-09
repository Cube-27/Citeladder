import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import { setActiveWorkspaceId } from '@/lib/api/client';
import { mswServer } from '@/test/msw-server';

/** Shared isolation contract for page fixtures that own the MSW lifecycle. */
export function setupMswPageTests(resetNavigation: () => void) {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    window.localStorage?.clear();
    setActiveWorkspaceId(null);
    resetNavigation();
  });
  afterEach(() => {
    mswServer.resetHandlers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(() => mswServer.close());
}
