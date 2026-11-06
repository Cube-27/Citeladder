'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { AuthShell } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/button';
import { OnboardingStep } from '@/components/ui/onboarding-shell';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { QueryState } from '@/components/ui/query-state';
import { authQueries } from '@/lib/api/auth';
import { signOutForChangedTerms } from '@/lib/auth/account-transition';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

const FORM_ID = 'workspace-setup-form';

/**
 * Create the person's own workspace before its first project. This is where
 * their trial starts. The Terms decision was made on the sign-in or sign-up
 * form and recorded with the account, so the person goes straight to naming
 * the workspace. A session older than the published revision holds no
 * decision on it: it ends, and the sign-in form asks for the decision.
 */
export function WorkspaceSetup() {
  const queryClient = useQueryClient();
  const terms = useQuery(authQueries.terms());
  const leave = useMutation({ mutationFn: () => signOutForChangedTerms(queryClient) });
  const sessionPredatesTerms = terms.isSuccess && !terms.data.accepted_at;
  const { mutate: signOut } = leave;
  // Once: leaving clears the cache, and the re-read must not sign out again.
  const leaving = useRef(false);
  useEffect(() => {
    if (!sessionPredatesTerms || leaving.current) return;
    leaving.current = true;
    signOut();
  }, [signOut, sessionPredatesTerms]);

  const failure = terms.error ?? leave.error;
  if (failure)
    return (
      <AuthShell mainLabel="Workspace setup" barEnd={<UserMenuTrigger presenter="compact" />}>
        <QueryState
          kind="error"
          error={failure}
          fallback="We could not load workspace setup."
          onRetry={() => (terms.error ? void terms.refetch() : signOut())}
          pending={terms.isFetching || leave.isPending}
        />
      </AuthShell>
    );
  if (!terms.data?.accepted_at) return <AuthShell mainLabel="Workspace setup">{null}</AuthShell>;
  return <NameWorkspace termsRevision={terms.data.terms_revision} />;
}

function NameWorkspace({ termsRevision }: Readonly<{ termsRevision: string }>) {
  const navigate = useNavigate();
  const { setActiveWorkspaceId } = useProjectContext();
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const create = useMutation(workspaceMutations.create());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missingName = name.trim() === '';
    setNameMissing(missingName);
    if (missingName) return;
    create.mutate(
      { name: name.trim(), termsRevision },
      {
        onSuccess: (workspace) => {
          setActiveWorkspaceId(workspace.id);
          navigate(workspaceDestination('/onboarding', null, workspace.id), { replace: true });
        },
      },
    );
  };

  return (
    <AuthShell mainLabel="Workspace setup" barEnd={<UserMenuTrigger presenter="compact" />}>
      <OnboardingStep
        title="Set up your workspace"
        help="Your projects and team live here. Your trial starts when you create it."
        next={
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            disabled={create.isPending}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Create workspace
          </Button>
        }
      >
        <form id={FORM_ID} noValidate onSubmit={submit}>
          <Stack gap="workspace">
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
              <MutationNotice
                notice={mutationNoticeForError(create.error, { action: 'create the workspace' })}
              />
            ) : null}
          </Stack>
        </form>
      </OnboardingStep>
    </AuthShell>
  );
}
