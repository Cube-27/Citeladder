import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import { DateField } from '@/components/ui/date-field';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { RadioGroup } from '@/components/ui/radio-group';
import { textRole } from '@/components/ui/typography';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyList,
  ApiKeyScope,
} from '@citeladder/contracts/api-keys';
import { KeyRound } from '@/lib/icons';
import { apiKeyMutations, apiKeyQueries } from '@/lib/api/api-keys';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { endOfDayInZone, useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount } from '@/lib/format';
import { API_HOST_ORIGIN } from '@/lib/config/api-host';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { SettingsGroup } from '@/components/ui/setting-row';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { TextLink } from '@/components/ui/text-link';

const API_BASE_URL = `${API_HOST_ORIGIN}/v1`;

const SCOPES: readonly { value: ApiKeyScope; label: string }[] = [
  { value: 'read', label: 'Read reports and settings' },
  { value: 'prompts:write', label: 'Edit prompts and topics, run prompt generation' },
  { value: 'competitors:write', label: 'Edit tracked competitors' },
  { value: 'audits:run', label: 'Launch and cancel audits' },
  { value: 'schedules:write', label: 'Edit audit schedules' },
  { value: 'actions:write', label: 'Update actions and record implementations' },
];

function KeyStateMark({ state }: Readonly<{ state: ApiKey['state'] }>) {
  switch (state) {
    case 'active':
      return (
        <StatusMark variant="status" value="success">
          Active
        </StatusMark>
      );
    case 'expired':
      return (
        <StatusMark variant="status" value="warning">
          Expired
        </StatusMark>
      );
    case 'revoked':
      return <StatusMark>Revoked</StatusMark>;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function KeyRow({
  apiKey,
  projectNames,
  onRevoke,
}: Readonly<{
  apiKey: ApiKey;
  projectNames: ReadonlyMap<string, string>;
  onRevoke: () => void;
}>) {
  const projects =
    apiKey.project_ids === null
      ? 'All projects'
      : apiKey.project_ids.map((id) => projectNames.get(id) ?? 'A deleted project').join(', ');
  const access = apiKey.scopes.join(', ');
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <ClampText tooltip={apiKey.name}>{apiKey.name}</ClampText>
          <code className={textRole('caption', 'truncate')}>{apiKey.prefix}…</code>
        </div>
      </TableCell>
      <TableCell>
        <div className="grid min-w-0 justify-items-start">
          <KeyStateMark state={apiKey.state} />
          {apiKey.expires_at && apiKey.state === 'active' ? (
            <span className={textRole('caption')}>
              Expires <DisplayTime value={apiKey.expires_at} dateOnly />
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {apiKey.last_used_at ? (
          <DisplayTime value={apiKey.last_used_at} dateOnly />
        ) : (
          <span className="text-ink-2">Never</span>
        )}
      </TableCell>
      <TableCell>
        <div className="grid min-w-0">
          <ClampText tooltip={access}>{access}</ClampText>
          <ClampText tooltip={projects} className={textRole('caption')}>
            {projects}
          </ClampText>
        </div>
      </TableCell>
      <TableActionsCell>
        {apiKey.state === 'active' ? (
          <ActionButton action="revoke" aria-label={`Revoke ${apiKey.name}`} onClick={onRevoke} />
        ) : null}
      </TableActionsCell>
    </TableRow>
  );
}

const KEY_COLUMNS: readonly DataTableColumn[] = [
  { key: 'key', label: 'Key', kind: 'identity' },
  { key: 'status', label: 'Status', kind: 'status', width: 'status' },
  { key: 'used', label: 'Last used', kind: 'date', width: 'date' },
  { key: 'scopes', label: 'Access', kind: 'text', width: 'name' },
  { key: 'revoke', label: 'Actions', kind: 'actions', width: 'action', hideLabel: true },
];

function CreateKeyDialog({
  open,
  workspaceId,
  onClose,
}: Readonly<{ open: boolean; workspaceId: string; onClose: () => void }>) {
  const { projects } = useProjectContext();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ReadonlySet<ApiKeyScope>>(new Set(['read']));
  const [projectMode, setProjectMode] = useState<'all' | 'chosen'>('all');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [expiresOn, setExpiresOn] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const create = useMutation(apiKeyMutations.create(workspaceId));
  const timeZone = useDisplayTimeZone();
  const createKey = () =>
    create.mutate(
      {
        name,
        scopes: [...scopes],
        project_ids: projectMode === 'all' ? null : [...chosen],
        expires_at: expiresOn ? endOfDayInZone(expiresOn, timeZone) : null,
      },
      { onSuccess: setCreated },
    );
  const toggle = <T,>(set: ReadonlySet<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };
  const close = () => {
    setName('');
    setScopes(new Set(['read']));
    setProjectMode('all');
    setChosen(new Set());
    setExpiresOn('');
    setCreated(null);
    create.reset();
    onClose();
  };
  const expiryValid = expiresOn === '' || z.iso.date().safeParse(expiresOn).success;
  const ready = name.trim() !== '' && (projectMode === 'all' || chosen.size > 0) && expiryValid;

  return (
    <Dialog
      open={open}
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
            <legend className={textRole('body', 'text-ink-2')}>What the key can do</legend>
            {SCOPES.map((scope) => (
              <Checkbox
                key={scope.value}
                label={scope.label}
                checked={scope.value === 'read' || scopes.has(scope.value)}
                disabled={scope.value === 'read'}
                onCheckedChange={(on) => setScopes(toggle(scopes, scope.value, on === true))}
              />
            ))}
            <p className={textRole('caption')}>Capped at your role.</p>
          </Stack>
          <RadioGroup
            ariaLabel="Projects the key can reach"
            value={projectMode}
            onValueChange={setProjectMode}
            options={[
              { value: 'all', label: 'All projects' },
              { value: 'chosen', label: 'Chosen projects' },
            ]}
          />
          {projectMode === 'chosen' ? (
            <Stack as="fieldset" gap="tight">
              <legend className={textRole('body', 'text-ink-2')}>Projects</legend>
              {projects.map((project) => (
                <Checkbox
                  key={project.id}
                  label={project.name}
                  checked={chosen.has(project.id)}
                  onCheckedChange={(on) => setChosen(toggle(chosen, project.id, on === true))}
                />
              ))}
            </Stack>
          ) : null}
          <Field
            label="Expires"
            hint={`Optional. Ends at midnight, ${timeZone}`}
            error={expiryValid ? undefined : 'Enter a date as YYYY-MM-DD.'}
          >
            {(props) => (
              <DateField
                id={props.id}
                aria-describedby={props['aria-describedby']}
                aria-invalid={props['aria-invalid']}
                ariaLabel="Expiry date"
                value={expiresOn}
                onChange={setExpiresOn}
              />
            )}
          </Field>
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

const liveKeys = (keys: readonly ApiKey[]) => keys.filter((key) => key.state === 'active').length;

function KeysHeadActions({
  list,
  onCreate,
}: Readonly<{ list: ApiKeyList | undefined; onCreate: () => void }>) {
  if (!list?.available) return null;
  const live = liveKeys(list.keys);
  const limit = list.limit ?? 0;
  return (
    <>
      <span className={textRole('caption', 'text-ink-2')}>
        {`${formatCount(live)} of ${formatCount(limit)} keys in use`}
      </span>
      <Button onClick={onCreate} disabled={live >= limit}>
        Create key
      </Button>
    </>
  );
}

function ApiKeysBody({
  query,
  workspaceId,
  projectNames,
  onRevoke,
}: Readonly<{
  query: UseQueryResult<ApiKeyList>;
  workspaceId: string;
  projectNames: ReadonlyMap<string, string>;
  onRevoke: (key: ApiKey) => void;
}>) {
  if (query.isPending)
    return (
      <StateBlock kind="loading" label="Loading API keys…" shape={{ kind: 'table', columns: 5 }} />
    );
  if (query.isError)
    return (
      <StateBlock
        kind="error"
        title="Couldn't load API keys"
        fallback="API keys could not be loaded."
        {...readErrorProps(query)}
      />
    );
  const { available, keys } = query.data;
  return (
    <>
      {available ? null : (
        <Notice tone="info">
          The REST API needs a paid plan.{' '}
          <TextLink asChild>
            <Link to={workspaceDestination('/billing', null, workspaceId)}>Choose a plan</Link>
          </TextLink>
        </Notice>
      )}
      {keys.length === 0 && available ? (
        <StateBlock kind="empty" icon={KeyRound} heading="No API keys yet" />
      ) : null}
      {keys.length === 0 ? null : (
        <DataTable label="API keys" columns={KEY_COLUMNS}>
          {keys.map((key) => (
            <KeyRow
              key={key.id}
              apiKey={key}
              projectNames={projectNames}
              onRevoke={() => onRevoke(key)}
            />
          ))}
        </DataTable>
      )}
    </>
  );
}

export function ApiKeys() {
  const { activeWorkspaceId, projects } = useProjectContext();
  const workspaceId = activeWorkspaceId ?? '';
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<ApiKey | null>(null);
  const query = useQuery({ ...apiKeyQueries.list(workspaceId), enabled: workspaceId !== '' });
  const revoke = useMutation(apiKeyMutations.revoke(workspaceId));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <>
      <SettingsGroup
        title="API keys"
        region={false}
        description={
          <>
            <code className={textRole('code', 'break-words')}>{API_BASE_URL}</code>{' '}
            <CopyButton
              value={API_BASE_URL}
              iconOnly
              variant="quiet"
              className="align-middle"
              copiedLabel="Copied the API address"
            />
          </>
        }
        action={<KeysHeadActions list={query.data} onCreate={() => setCreating(true)} />}
      >
        <ApiKeysBody
          query={query}
          workspaceId={workspaceId}
          projectNames={projectNames}
          onRevoke={(key) => {
            revoke.reset();
            setPending(key);
          }}
        />
      </SettingsGroup>
      <CreateKeyDialog
        open={creating}
        workspaceId={workspaceId}
        onClose={() => setCreating(false)}
      />
      <ConfirmDialog
        pending={revoke.isPending}
        onCancel={() => setPending(null)}
        request={
          pending && {
            title: `Revoke ${pending.name}?`,
            confirmLabel: 'Revoke',
            destructive: true,
            onConfirm: () => revoke.mutate(pending.id, { onSuccess: () => setPending(null) }),
            body: (
              <Stack gap="compact">
                <p>Cannot be undone.</p>
                {revoke.isError ? (
                  <Notice
                    kind="mutation"
                    notice={mutationNoticeForError(revoke.error, { action: 'revoke the API key' })}
                  />
                ) : null}
              </Stack>
            ),
          }
        }
      />
    </>
  );
}
