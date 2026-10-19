'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { FlowActions, FlowShell } from '@/components/auth/flow-shell';
import { TermsReview } from '@/components/auth/policy-acceptance';
import { FlowAccountControls } from '@/components/layout/flow-account-controls';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { authApi } from '@/lib/api/auth';
import { humanizeApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import type { Workspace } from '@/lib/api/types';
import { workspacesApi } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

const FORM_ID = 'workspace-setup-form';

/**
 * Create the person's own workspace before its first project. This is where
 * their trial starts. A person who signed up made their Terms decision on the
 * signup form and goes straight to naming the workspace; one without a recorded
 * decision (an operator- or invitation-made account) reviews the Terms first.
 */
export function WorkspaceSetup() {
  const queryClient = useQueryClient();
  const terms = useQuery({
    queryKey: queryKeys.auth.terms(),
    queryFn: ({ signal }) => authApi.terms(signal),
  });
  const accept = useMutation({
    mutationFn: (revision: string) => authApi.acceptTerms(revision),
    onSuccess: (status) => queryClient.setQueryData(queryKeys.auth.terms(), status),
  });

  if (terms.isPending) return <FlowShell mainLabel="Workspace setup">{null}</FlowShell>;
  if (!terms.data?.accepted_at)
    return (
      <FlowShell mainLabel="Terms review" trailing={<FlowAccountControls />}>
        <Stack gap="workspace">
          <TermsReview
            revision={terms.data?.terms_revision}
            readError={terms.error}
            onRetry={() => void terms.refetch()}
            accepting={accept.isPending}
            acceptError={accept.error}
            onAccept={(revision) => accept.mutate(revision)}
          />
        </Stack>
      </FlowShell>
    );
  return <NameWorkspace termsRevision={terms.data.terms_revision} />;
}

function NameWorkspace({ termsRevision }: Readonly<{ termsRevision: string }>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setActiveWorkspaceId } = useProjectContext();
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const create = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim(), termsRevision }),
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(queryKeys.workspaces.list(), (current) => [
        ...(current ?? []),
        workspace,
      ]);
      setActiveWorkspaceId(workspace.id);
      navigate(workspaceDestination('/onboarding', null, workspace.id), { replace: true });
    },
    // The decision was revoked or the Terms changed: read it again, which
    // brings back the review.
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.auth.terms() }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missingName = name.trim() === '';
    setNameMissing(missingName);
    if (missingName) return;
    create.mutate();
  };

  return (
    <FlowShell
      mainLabel="Workspace setup"
      trailing={<FlowAccountControls />}
      actions={
        <FlowActions
          primary={
            <Button
              type="submit"
              form={FORM_ID}
              disabled={create.isPending}
              pending={create.isPending}
              pendingLabel="Creating…"
            >
              Create workspace
            </Button>
          }
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit}>
        <Stack gap="workspace">
          <div className="flow-header">
            <h1 className="flow-title">Set up your workspace</h1>
            <p className="flow-help">
              Your projects and team live here. Your trial starts when you create it.
            </p>
          </div>
          <Field
            label="Workspace name"
            required
            error={nameMissing ? 'Name your workspace.' : undefined}
          >
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme"
                maxLength={255}
              />
            )}
          </Field>
          {create.error ? (
            <Alert tone="danger">{humanizeApiError(create.error).message}</Alert>
          ) : null}
        </Stack>
      </form>
    </FlowShell>
  );
}
