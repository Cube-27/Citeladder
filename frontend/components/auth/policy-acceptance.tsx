import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { policiesApi } from '@/lib/api/policies';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { useProjectContext } from '@/lib/project/project-context';
import { websiteHref } from '@/lib/config/app-link';

export function PolicyAcceptanceGate({ children }: Readonly<{ children: ReactNode }>) {
  const { activeWorkspaceId } = useProjectContext();
  if (!activeWorkspaceId) return children;
  return (
    <WorkspacePolicy key={activeWorkspaceId} workspaceId={activeWorkspaceId}>
      {children}
    </WorkspacePolicy>
  );
}

function WorkspacePolicy({
  workspaceId,
  children,
}: Readonly<{ workspaceId: string; children: ReactNode }>) {
  const cache = useQueryClient();
  const [checked, setChecked] = useState(false);
  const queryKey = queryKeys.policies.workspace(workspaceId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => policiesApi.status(workspaceId, signal),
  });
  const accept = useMutation({
    mutationFn: (revision: string) => policiesApi.accept(workspaceId, revision),
    onSuccess: (data) => cache.setQueryData(queryKey, data),
    onError: () => {
      setChecked(false);
      void query.refetch();
    },
  });
  if (query.data?.accepted_at) return children;
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-8">
      <h1>Review the Terms of Service</h1>
      {query.isPending ? <output>Loading current policies…</output> : null}
      {query.isError ? (
        <Alert tone="danger">
          {humanizeApiError(query.error).message}
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </Alert>
      ) : null}
      {query.data ? (
        <>
          <p>
            Read the{' '}
            <a href={websiteHref('/terms')} target="_blank" rel="noreferrer">
              Terms of Service
            </a>{' '}
            (revision {query.data.terms_revision}). Our{' '}
            <a href={websiteHref('/privacy')} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>{' '}
            explains how we process data. Optional analytics is a separate choice.
          </p>
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
            label="I agree to the Terms of Service."
          />
          <Button
            disabled={!checked || accept.isPending}
            onClick={() => accept.mutate(query.data.terms_revision)}
          >
            Accept and continue
          </Button>
        </>
      ) : null}
      {accept.isError ? (
        <Alert tone="danger">{humanizeApiError(accept.error).message}</Alert>
      ) : null}
    </main>
  );
}
