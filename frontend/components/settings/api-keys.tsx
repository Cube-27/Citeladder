import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
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
import {
  TableActionsCell,
  TableCell,
  TableCellLines,
  TableRow,
  TableTime,
} from '@/components/ui/table';
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyList,
  ApiKeyScope,
} from '@citeladder/contracts/api-keys';
import { apiKeyMutations, apiKeyQueries } from '@/lib/api/api-keys';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { endOfDayInZone, useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount } from '@/lib/format';
import { API_HOST_ORIGIN } from '@/lib/config/api-host';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { TextLink } from '@/components/ui/text-link';

const API_BASE_URL = `${API_HOST_ORIGIN}/v1`;

/** What each scope lets a key do; `read` is always granted. */
const SCOPES: readonly { value: ApiKeyScope; label: string }[] = [
  { value: 'read', label: 'Read reports and settings' },
  { value: 'prompts:write', label: 'Edit prompts and topics, run prompt generation' },
  { value: 'competitors:write', label: 'Edit tracked competitors' },
  { value: 'audits:run', label: 'Launch and cancel audits' },
  { value: 'schedules:write', label: 'Edit audit schedules' },
  { value: 'actions:write', label: 'Update actions and record implementations' },
];

/** A key's state as its one status mark: Active positive, Expired warning, Revoked neutral. */
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
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <ClampText lines={1} className={textRole('body')}>
            {apiKey.name}
          </ClampText>
          <ClampText lines={1} className={textRole('caption')}>
            <code>{apiKey.prefix}…</code> ·{' '}
            {apiKey.created_by_email ? `Created by ${apiKey.created_by_email} · ` : null}
            Created <DisplayTime value={apiKey.created_at} dateOnly />
            {apiKey.expires_at ? (
              <>
                {' '}
                · Expires <DisplayTime value={apiKey.expires_at} dateOnly />
              </>
            ) : null}
          </ClampText>
        </div>
      </TableCell>
      <TableCell>
        <TableCellLines
          primary={<KeyStateMark state={apiKey.state} />}
          secondary={<TableTime value={apiKey.last_used_at} fallback="Not used yet" />}
        />
      </TableCell>
      <TableCell>
        <ClampText>{apiKey.scopes.join(', ')}</ClampText>
      </TableCell>
      <TableCell>
        <ClampText lines={1}>{projects}</ClampText>
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
  // The last use sits under the state: a narrow page has no room for its own column.
  { key: 'status', label: 'Status', sublabel: 'Last used', kind: 'status', width: 'category' },
  { key: 'scopes', label: 'Access', kind: 'text', width: 'name' },
  { key: 'projects', label: 'Projects', kind: 'text', width: 'status', priority: 'low' },
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
  // The list shows the expiry in the display time zone, so the chosen day is that zone's day.
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
  // A typed expiry must be a real calendar day before it becomes an instant.
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
          {/* The secret is shown once, whole, so it may wrap anywhere to stay readable. */}
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

/** Keys in use against the plan's limit, and the create action while under it. */
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

/** The plan note and the key table, or the read's loading or failure in their place. */
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
    <Stack gap="workspace">
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
    </Stack>
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
      <Section>
        <SectionHeader
          actions={<KeysHeadActions list={query.data} onCreate={() => setCreating(true)} />}
        >
          <SectionTitle>API keys</SectionTitle>
          <SectionDescription>
            <code className={textRole('code', 'break-words')}>{API_BASE_URL}</code>{' '}
            <CopyButton
              value={API_BASE_URL}
              iconOnly
              variant="quiet"
              className="align-middle"
              copiedLabel="Copied the API address"
            />
          </SectionDescription>
        </SectionHeader>
        <ApiKeysBody
          query={query}
          workspaceId={workspaceId}
          projectNames={projectNames}
          onRevoke={(key) => {
            revoke.reset();
            setPending(key);
          }}
        />
      </Section>
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
