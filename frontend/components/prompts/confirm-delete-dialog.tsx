import type { ConfirmRequest } from '@/components/ui/dialog';
import type { Prompt, Topic } from '@citeladder/contracts';

export type PendingDelete = { kind: 'prompt'; prompt: Prompt } | { kind: 'topic'; topic: Topic };

function copy(pending: PendingDelete) {
  if (pending.kind === 'prompt')
    return {
      title: 'Delete this prompt?',
      description:
        'Future runs stop measuring it. Results from past runs are kept. Archive it instead to keep it in the library.',
    };
  const count = pending.topic.active_count;
  const activePrompts = count === 1 ? 'active prompt' : `${count} active prompts`;
  return {
    title: `Delete topic “${pending.topic.name}”?`,
    description: count
      ? `Its ${activePrompts}, any other prompts and any subtopics stay in the library without a topic.`
      : 'Its prompts and subtopics, if any, stay in the library without a topic.',
  };
}

/** Deletion states its effect before it happens; a stray click no longer unfiles a topic. */
export function deleteRequest(
  pending: PendingDelete | null,
  onConfirm: () => void,
): ConfirmRequest | null {
  if (!pending) return null;
  const { title, description } = copy(pending);
  return { title, body: description, confirmLabel: 'Delete', destructive: true, onConfirm };
}
