import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getActiveWorkspaceId, setActiveWorkspaceId } from '@/lib/api/client';
import { clearAccountScopedClientState } from '@/lib/auth/account-transition';
import { ACTIVE_PROJECT_STORAGE_KEY } from '@/lib/project/active-project-storage';

afterEach(() => {
  window.localStorage.clear();
  setActiveWorkspaceId(null);
});

describe('clearAccountScopedClientState', () => {
  it('contains cancellation errors and always clears account state', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['old-account'], { private: true });
    vi.spyOn(queryClient, 'cancelQueries').mockRejectedValueOnce(new Error('cancellation failed'));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'old-project');
    setActiveWorkspaceId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    await expect(clearAccountScopedClientState(queryClient)).resolves.toBeUndefined();

    expect(queryClient.getQueryData(['old-account'])).toBeUndefined();
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(getActiveWorkspaceId()).toBeNull();
  });
});
