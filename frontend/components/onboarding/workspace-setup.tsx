'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { TermsConsent } from '@/components/auth/auth-form';
import { FlowActions, FlowShell } from '@/components/auth/flow-shell';
import { ThemeSwitch } from '@/components/layout/theme-switch';
import { UserMenuTrigger } from '@/components/layout/user-menu';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
 * they accept the Terms and where their trial starts.
 */
export function WorkspaceSetup() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setActiveWorkspaceId } = useProjectContext();
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const consentRef = useRef<HTMLDivElement>(null);
  const terms = useQuery({
    queryKey: queryKeys.auth.policies(),
    queryFn: () => authApi.policies(),
  });
  const create = useMutation({
    mutationFn: (termsRevision: string) =>
      workspacesApi.create({ name: name.trim(), termsRevision }),
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(queryKeys.workspaces.list(), (current) => [
        ...(current ?? []),
        workspace,
      ]);
      setActiveWorkspaceId(workspace.id);
      navigate(workspaceDestination('/onboarding', null, workspace.id), { replace: true });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missingName = name.trim() === '';
    setNameMissing(missingName);
    setConsentMissing(!agreed);
    if (!agreed) consentRef.current?.querySelector<HTMLElement>('button[role="checkbox"]')?.focus();
    if (missingName || !agreed || !terms.data) return;
    create.mutate(terms.data.terms_revision);
  };

  const error = create.error ?? terms.error;
  return (
    <FlowShell
      mainLabel="Workspace setup"
      trailing={
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <UserMenuTrigger presenter="compact" />
        </div>
      }
      actions={
        <FlowActions
          primary={
            <Button
              type="submit"
              form={FORM_ID}
              disabled={create.isPending || !terms.data}
              pending={create.isPending}
              pendingLabel="Creating…"
            >
              Create workspace
            </Button>
          }
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="grid gap-5">
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
              size="lg"
            />
          )}
        </Field>
        <TermsConsent
          ref={consentRef}
          agreed={agreed}
          missing={consentMissing}
          onChange={(value) => {
            setAgreed(value);
            if (value) setConsentMissing(false);
          }}
        />
        {error ? <Alert tone="danger">{humanizeApiError(error).message}</Alert> : null}
      </form>
    </FlowShell>
  );
}
