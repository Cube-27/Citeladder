import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearAccountScopedClientState } from '@/lib/auth/account-transition';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ACTIVE_WORKSPACE_STORAGE_KEY,
} from '@/lib/project/active-project-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('clearAccountScopedClientState', () => {
  it('contains cancellation errors and always clears account state', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['old-account'], { private: true });
    vi.spyOn(queryClient, 'cancelQueries').mockRejectedValueOnce(new Error('cancellation failed'));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'old-project');
    window.localStorage.setItem(
      ACTIVE_WORKSPACE_STORAGE_KEY,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    await expect(clearAccountScopedClientState(queryClient)).resolves.toBeUndefined();

    expect(queryClient.getQueryData(['old-account'])).toBeUndefined();
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });
});
