import type { FactCheckPromptList } from '@citeladder/contracts/fact-checking';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { useToast } from '@/components/ui/toast';
import { textRole } from '@/components/ui/typography';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectMutations, projectQueries } from '@/lib/api/projects';
import { formatCount } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';

type Prompt = FactCheckPromptList['prompts'][number];

const NO_TOPIC = 'No topic';

function byTopic(prompts: readonly Prompt[]) {
  const groups = new Map<string, Prompt[]>();
  for (const prompt of prompts) {
    const topic = prompt.topic ?? NO_TOPIC;
    const group = groups.get(topic);
    if (group) group.push(prompt);
    else groups.set(topic, [prompt]);
  }
  return [...groups];
}

function groupState(prompts: readonly Prompt[], checked: ReadonlySet<string>) {
  const on = prompts.filter((prompt) => checked.has(prompt.id)).length;
  if (on === 0) return false;
  return on === prompts.length ? true : 'indeterminate';
}

export function FactPromptsDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const scope = useProjectScope();
  const query = useQuery(projectQueries.factCheckPrompts(scope));
  return (
    <Dialog
      open
      width="wide"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Fact-check these prompts"
      footer={query.data ? undefined : <Button onClick={onClose}>Cancel</Button>}
    >
      {query.isPending ? <StateBlock kind="loading" label="Loading prompts…" /> : null}
      {query.isError ? (
        <StateBlock
          kind="error"
          title="Couldn't load the prompts"
          fallback="The prompts could not be loaded."
          {...readErrorProps(query)}
        />
      ) : null}
      {query.data ? <PromptPicker list={query.data} onClose={onClose} /> : null}
    </Dialog>
  );
}

function PromptPicker({
  list,
  onClose,
}: Readonly<{ list: FactCheckPromptList; onClose: () => void }>) {
  const scope = useProjectScope();
  const { notify } = useToast();
  const save = useMutation(projectMutations.setFactCheckPrompts(scope));
  const [checked, setChecked] = useState(
    () => new Set(list.prompts.filter((prompt) => prompt.checked).map((prompt) => prompt.id)),
  );
  const toggle = (ids: readonly string[], on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  if (!list.prompts.length)
    return <StateBlock kind="empty" inline message="No active prompts in this project." />;
  return (
    <Stack gap="workspace">
      {save.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(save.error, { action: 'save the prompts' })}
        />
      ) : null}
      {byTopic(list.prompts).map(([topic, prompts]) => (
        <Stack key={topic} gap="compact">
          <Checkbox
            label={<span className={textRole('label')}>{topic}</span>}
            checked={groupState(prompts, checked)}
            onCheckedChange={(on) =>
              toggle(
                prompts.map((prompt) => prompt.id),
                on === true,
              )
            }
          />
          {prompts.map((prompt) => (
            <Checkbox
              key={prompt.id}
              nested
              label={prompt.text}
              checked={checked.has(prompt.id)}
              onCheckedChange={(on) => toggle([prompt.id], on === true)}
            />
          ))}
        </Stack>
      ))}
      <div className="flex items-center justify-between gap-3">
        <span className={textRole('caption')}>
          {formatCount(checked.size)} of {formatCount(list.prompts.length)}
        </span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            pending={save.isPending}
            onClick={() =>
              save.mutate(
                { prompt_ids: [...checked] },
                {
                  onSuccess: () => {
                    notify('Prompts saved', 'The next run checks these prompts.');
                    onClose();
                  },
                },
              )
            }
          >
            Save prompts
          </Button>
        </span>
      </div>
    </Stack>
  );
}
