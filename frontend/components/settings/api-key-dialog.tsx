import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  DEFAULT_EXPIRY,
  EXPIRY_PRESET_DAYS,
  addDays,
  dayInZone,
  presetLabelDate,
  resolveExpiry,
  type ExpiryChoice,
} from '@/components/settings/api-key-expiry';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import { DateField } from '@/components/ui/date-field';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { RadioGroup } from '@/components/ui/radio-group';
import { Select } from '@/components/ui/select';
import { textRole } from '@/components/ui/typography';
import {
  apiKeyScopeSchema,
  type ApiKeyCreated,
  type ApiKeyScope,
} from '@citeladder/contracts/api-keys';
import { apiKeyMutations } from '@/lib/api/api-keys';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

type KeyAccess = 'read' | 'write';

const ALL_SCOPES: readonly ApiKeyScope[] = apiKeyScopeSchema.options;

function expiryOptions(today: string) {
  return [
    ...EXPIRY_PRESET_DAYS.map((days) => ({
      value: `${days}` as const,
      label: (
        <>
          {days === 1 ? '1 day' : `${days} days`}{' '}
          <span className="text-ink-2">({presetLabelDate(addDays(today, days), today)})</span>
        </>
      ),
    })),
    { value: 'custom' as const, label: 'Custom' },
    { value: 'never' as const, label: <span className="text-negative">Never</span> },
  ];
}

function useToggleSet<T>() {
  const [set, setSet] = useState<ReadonlySet<T>>(new Set());
  const toggle = (value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    setSet(next);
  };
  return { set, toggle, clear: () => setSet(new Set()) };
}

export function CreateKeyDialog({
  openedAt,
  workspaceId,
  onClose,
}: Readonly<{ openedAt: Date | null; workspaceId: string; onClose: () => void }>) {
  const { projects } = useProjectContext();
  const mayWrite = useWorkspaceCapability('write');
  const [name, setName] = useState('');
  const [access, setAccess] = useState<KeyAccess>('read');
  const [projectMode, setProjectMode] = useState<'all' | 'chosen'>('all');
  const chosen = useToggleSet<string>();
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDay, setCustomDay] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const create = useMutation(apiKeyMutations.create(workspaceId));
  const timeZone = useDisplayTimeZone();
  const today = dayInZone(openedAt ?? new Date(0), timeZone);
  const expiry = resolveExpiry({ choice: expiryChoice, customDay, today, timeZone });
  const expiryError = expiry.kind === 'invalid' && customDay !== '' ? expiry.message : undefined;
  const ready =
    name.trim() !== '' &&
    (projectMode === 'all' || chosen.set.size > 0) &&
    expiry.kind !== 'invalid';
  const createKey = () => {
    if (expiry.kind === 'invalid') return;
    create.mutate(
      {
        name,
        scopes: access === 'write' && mayWrite ? [...ALL_SCOPES] : ['read'],
        project_ids: projectMode === 'all' ? null : [...chosen.set],
        expires_at: expiry.kind === 'at' ? expiry.expiresAt : null,
      },
      { onSuccess: setCreated },
    );
  };
  const close = () => {
    setName('');
    setAccess('read');
    setProjectMode('all');
    chosen.clear();
    setExpiryChoice(DEFAULT_EXPIRY);
    setCustomDay('');
    setCreated(null);
    create.reset();
    onClose();
  };

  return (
    <Dialog
      open={openedAt !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={created ? 'Copy your API key' : 'Create an API key'}
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <Button
            variant="primary"
            pending={create.isPending}
            disabled={!ready}
            onClick={createKey}
          >
            Create key
          </Button>
        )
      }
    >
      {created ? (
        <Stack gap="compact">
          <Notice tone="warning">Shown once.</Notice>
          <code className="type-code break-all">{created.secret}</code>
          <div>
            <CopyButton value={created.secret}>Copy key</CopyButton>
          </div>
        </Stack>
      ) : (
        <Stack gap="compact">
          <Field label="Name" required>
            {(props) => (
              <Input
                {...props}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Stack as="fieldset" gap="tight">
            <legend className={textRole('label')}>Access</legend>
            <RadioGroup
              ariaLabel="What the key can do"
              value={access}
              onValueChange={setAccess}
              options={[
                { value: 'read', label: 'Read' },
                {
                  value: 'write',
                  label: 'Read and write',
                  disabled: !mayWrite,
                  description: mayWrite ? undefined : 'Capped at your role.',
                },
              ]}
            />
          </Stack>
          <Stack as="fieldset" gap="tight">
            <legend className={textRole('label')}>Projects</legend>
            <RadioGroup
              ariaLabel="Projects the key can reach"
              value={projectMode}
              onValueChange={setProjectMode}
              options={[
                { value: 'all', label: 'All projects' },
                { value: 'chosen', label: 'Chosen projects' },
              ]}
            />
            {projectMode === 'chosen'
              ? projects.map((project) => (
                  <Checkbox
                    key={project.id}
                    label={project.name}
                    checked={chosen.set.has(project.id)}
                    onCheckedChange={(on) => chosen.toggle(project.id, on === true)}
                  />
                ))
              : null}
          </Stack>
          <Field label="Expires" hint={`Ends at midnight, ${timeZone}`}>
            {(props) => (
              <Select
                id={props.id}
                aria-describedby={props['aria-describedby']}
                ariaLabel="Expires"
                className="w-full"
                value={expiryChoice}
                onValueChange={setExpiryChoice}
                options={expiryOptions(today)}
              />
            )}
          </Field>
          {expiryChoice === 'custom' ? (
            <Field label="Expiry date" error={expiryError}>
              {(props) => (
                <DateField
                  id={props.id}
                  aria-describedby={props['aria-describedby']}
                  aria-invalid={props['aria-invalid']}
                  ariaLabel="Expiry date"
                  min={today}
                  value={customDay}
                  onChange={setCustomDay}
                />
              )}
            </Field>
          ) : null}
          {create.isError ? (
            <Notice
              kind="mutation"
              notice={mutationNoticeForError(create.error, { action: 'create the API key' })}
            />
          ) : null}
        </Stack>
      )}
    </Dialog>
  );
}
