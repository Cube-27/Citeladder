import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { restartAt } from '@/lib/auth/account-transition';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ACTIVE_WORKSPACE_STORAGE_KEY,
} from '@/lib/project/active-project-storage';
import { THEME_COOKIE, setThemePreference } from '@/lib/theme/theme';

vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
const navigate = vi.mocked(hardNavigate);

afterEach(() => {
  navigate.mockReset();
  window.localStorage.clear();
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});

/** Let `restartAt` run up to its navigation; it never resolves by design. */
async function startRestart(queryClient: QueryClient, path: string) {
  let settled = false;
  void restartAt(queryClient, path).finally(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(path));
  return () => settled;
}

describe('restartAt', () => {
  it('keeps the departing page drawn and drops its cache only once the document is left', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['old-account'], { private: true });
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'old-project');
    window.localStorage.setItem(
      ACTIVE_WORKSPACE_STORAGE_KEY,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    setThemePreference('dark');

    const settled = await startRestart(queryClient, '/login');

    // The page on screen still has what it was showing while the next loads…
    expect(queryClient.getQueryData(['old-account'])).toEqual({ private: true });
    // …but the next document cannot pick up the old account's selection.
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
    // A device preference, not the account's, so it survives the change.
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);

    window.dispatchEvent(new Event('pagehide'));
    expect(queryClient.getQueryData(['old-account'])).toBeUndefined();
    // Callers stay pending until the page has changed.
    expect(settled()).toBe(false);
  });

  it('aborts the old account requests and still navigates when cancellation fails', async () => {
    const queryClient = new QueryClient();
    let aborted = false;
    const inFlight = queryClient
      .fetchQuery({
        queryKey: ['old-account', 'in-flight'],
        queryFn: ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(signal.reason);
            });
          }),
      })
      .catch(() => 'cancelled');

    await startRestart(queryClient, '/workspaces');
    expect(await inFlight).toBe('cancelled');
    expect(aborted).toBe(true);

    const failing = new QueryClient();
    vi.spyOn(failing, 'cancelQueries').mockRejectedValueOnce(new Error('cancellation failed'));
    await startRestart(failing, '/login?error=terms_changed');
  });
});
