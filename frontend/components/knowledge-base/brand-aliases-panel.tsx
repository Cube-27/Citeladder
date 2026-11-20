import { useMutation } from '@tanstack/react-query';
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { Project } from '@citeladder/contracts';

import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { SettingField, SettingRow, SettingRows } from '@/components/ui/setting-row';
import { textRole } from '@/components/ui/typography';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectMutations } from '@/lib/api/projects';
import { suggestAliases } from '@/lib/project/alias-suggestions';

/**
 * The brand's aliases: the other spellings answers use for it. Each change
 * saves the whole list; suggestions are kept with one click.
 */
export function BrandAliasesPanel({
  project,
  mayEdit,
}: Readonly<{ project: Project; mayEdit: boolean }>) {
  const save = useMutation(
    projectMutations.update({ workspaceId: project.workspace_id, projectId: project.id }),
  );
  const aliases = project.brand.aliases;
  // Settles with the save; the notice shows a failure.
  const saveAliases = (next: readonly string[]) =>
    save.mutateAsync({ brand: { aliases: [...new Set(next.map((alias) => alias.trim()))] } });
  const suggestions = suggestAliases({
    brandName: project.brand_name,
    aliases,
    domains: [project.website_url, ...project.owned_domains],
  });
  return (
    <Stack gap="workspace">
      {save.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(save.error, { action: 'save the aliases' })}
        />
      ) : null}
      {aliases.length ? (
        <SettingRows label="Aliases">
          {aliases.map((alias, index) => (
            <AliasRow
              key={alias}
              alias={alias}
              mayEdit={mayEdit}
              pending={save.isPending}
              onSave={(next) => saveAliases(aliases.map((old, at) => (at === index ? next : old)))}
              onDelete={() => saveAliases(aliases.filter((_, at) => at !== index))}
            />
          ))}
        </SettingRows>
      ) : (
        <Absence label="No aliases" />
      )}
      {mayEdit && suggestions.length ? (
        <SettingRows title="Suggested" titleId="alias-suggestions">
          {suggestions.map((suggestion) => (
            <SettingRow
              key={suggestion}
              label={<span className={textRole('body')}>{suggestion}</span>}
              action={
                <Button
                  variant="secondary"
                  disabled={save.isPending}
                  aria-label={`Keep ${suggestion}`}
                  onClick={() => void saveAliases([...aliases, suggestion]).catch(() => undefined)}
                >
                  <Icon icon={Check} />
                  Keep
                </Button>
              }
            />
          ))}
        </SettingRows>
      ) : null}
      {mayEdit ? (
        <AddAlias pending={save.isPending} onAdd={(alias) => saveAliases([...aliases, alias])} />
      ) : null}
    </Stack>
  );
}

function AddAlias({
  pending,
  onAdd,
}: Readonly<{ pending: boolean; onAdd: (alias: string) => Promise<unknown> }>) {
  const [draft, setDraft] = useState('');
  // A refused alias stays in the field; only a saved one clears it.
  const submit = async () => {
    const sent = draft;
    try {
      await onAdd(sent.trim());
    } catch {
      return;
    }
    setDraft((current) => (current === sent ? '' : current));
  };
  const empty = !draft.trim();
  return (
    <form
      aria-labelledby="add-alias"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || empty) return;
        void submit();
      }}
    >
      <SettingRows title="Add an alias" titleId="add-alias">
        <SettingField label="Alias">
          {(props) => (
            <Input {...props} value={draft} onChange={(event) => setDraft(event.target.value)} />
          )}
        </SettingField>
        <Inline className="flex-wrap justify-end">
          <Button type="submit" variant="primary" disabled={pending || empty}>
            <Icon icon={Plus} />
            Add alias
          </Button>
        </Inline>
      </SettingRows>
    </form>
  );
}

function AliasRow({
  alias,
  mayEdit,
  pending,
  onSave,
  onDelete,
}: Readonly<{
  alias: string;
  mayEdit: boolean;
  pending: boolean;
  onSave: (alias: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}>) {
  const [editing, setEditing] = useState<string | null>(null);
  const label =
    editing === null ? (
      <span className={textRole('body')}>{alias}</span>
    ) : (
      <Input
        aria-label={`Edit ${alias}`}
        value={editing}
        onChange={(event) => setEditing(event.target.value)}
      />
    );
  if (!mayEdit) return <SettingRow label={label} />;
  const actions =
    editing === null ? (
      <Inline as="span" className="flex-wrap">
        <Button variant="secondary" aria-label={`Edit ${alias}`} onClick={() => setEditing(alias)}>
          <Icon icon={Pencil} />
          Edit
        </Button>
        <Button
          variant="quiet"
          disabled={pending}
          aria-label={`Delete ${alias}`}
          onClick={() => void onDelete().catch(() => undefined)}
        >
          <Icon icon={Trash2} />
          Delete
        </Button>
      </Inline>
    ) : (
      <Inline as="span" className="flex-wrap">
        <Button variant="quiet" onClick={() => setEditing(null)}>
          <Icon icon={X} />
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !editing.trim()}
          onClick={() => {
            // The draft stays open until the save lands, so a failed save loses nothing.
            onSave(editing.trim()).then(
              () => setEditing(null),
              () => undefined,
            );
          }}
        >
          <Icon icon={Save} />
          Save
        </Button>
      </Inline>
    );
  return <SettingRow label={label} action={actions} />;
}
