import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { Button } from '@/components/ui/button';
import { SetupPage, SetupStep } from '@/components/templates/setup-page';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { authQueries } from '@/lib/api/auth';
import { useSignOutForChangedTerms } from '@/lib/auth/use-sign-out-for-changed-terms';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

const FORM_ID = 'workspace-setup-form';

/**
 * Create the person's own workspace before its first project. This is where
 * their trial starts. The Terms decision was made on the sign-in or sign-up
 * form and recorded with the account, so the person goes straight to naming
 * the workspace. A session older than the published revision holds no
 * decision on it: it ends, and the sign-in form asks for the decision.
 */
export function WorkspaceSetup() {
  const terms = useQuery(authQueries.terms());
  const leave = useSignOutForChangedTerms(terms.isSuccess && !terms.data.accepted_at);

  const failure = terms.error ?? leave.error;
  if (failure)
    return (
      <SetupPage label="Workspace setup" barEnd={<UserMenuTrigger presenter="compact" />}>
        <StateBlock
          kind="error"
          error={failure}
          title="Couldn't load workspace setup"
          fallback="Couldn't load workspace setup."
          onRetry={() => (terms.error ? void terms.refetch() : leave.mutate())}
          pending={terms.isFetching || leave.isPending}
        />
      </SetupPage>
    );
  if (!terms.data?.accepted_at) return <SetupPage label="Workspace setup">{null}</SetupPage>;
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
    <SetupPage label="Workspace setup" barEnd={<UserMenuTrigger presenter="compact" />}>
      <SetupStep
        width="narrow"
        title="Set up your workspace"
        help="Your trial starts when you create it."
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
              <Notice
                kind="mutation"
                notice={mutationNoticeForError(create.error, { action: 'create the workspace' })}
              />
            ) : null}
          </Stack>
        </form>
      </SetupStep>
    </SetupPage>
  );
}
