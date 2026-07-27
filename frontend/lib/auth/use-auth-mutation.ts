'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { SessionUser } from '@/lib/api/types';
import { clearAccountScopedClientState } from '@/lib/auth/account-transition';

/**
 * Shared login/register mutation wiring (F4): on success, prime the `me` cache
 * with the returned user and route directly to the right authed screen — no
 * marketing-landing bounce. The project list is fetched through the query
 * client (so it lands in the `projects.list` cache for the app shell) and
 * awaited, which keeps the mutation pending — and the submit button spinning —
 * until the redirect fires: no projects yet → `/onboarding`, otherwise
 * `/visibility`. A failed lookup falls back to `/onboarding` rather than stranding
 * the user on the auth screen. The submit handler swallows the rejection —
 * the error surfaces via `mutation.isError` in the page's inline alert.
 */
export function useAuthMutation<TValues>(mutationFn: (values: TValues) => Promise<SessionUser>) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: async (user: SessionUser) => {
      // Login/register is an identity boundary. Remove the previous account's
      // requests, cache, active workspace header, and project selection before
      // the newly-confirmed identity is seeded.
      await clearAccountScopedClientState(queryClient);
      queryClient.setQueryData(queryKeys.auth.me(), user);
      let destination = '/onboarding';
      try {
        const projects = await queryClient.fetchQuery({
          queryKey: queryKeys.projects.list(),
          queryFn: ({ signal }) => projectsApi.listProjects({ signal }),
        });
        if (projects.length > 0) destination = '/visibility';
      } catch {
        // Projects lookup failed — `/onboarding` is the safe default.
      }
      router.replace(destination);
    },
  });

  const submit = (values: TValues) => mutation.mutateAsync(values).catch(() => undefined);

  return { mutation, submit };
}
