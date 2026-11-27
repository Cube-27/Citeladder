import type { ConfirmRequest } from '@/components/ui/dialog';
import { pluralCount } from '@/lib/format';
import type { Prompt, Topic } from '@citeladder/contracts';

export type PendingDelete =
  | { kind: 'prompt'; prompt: Prompt }
  | { kind: 'prompts'; prompts: readonly Prompt[] }
  | { kind: 'topic'; topic: Topic };

function copy(pending: PendingDelete): { question: string; description: string; confirm: string } {
  switch (pending.kind) {
    case 'prompt':
      return {
        question: 'Delete this prompt',
        description: 'Past results are kept.',
        confirm: 'Delete prompt',
      };
    case 'prompts': {
      const prompts = pluralCount(pending.prompts.length, 'prompt');
      return {
        question: `Delete ${prompts}`,
        description: 'Past results are kept.',
        confirm: `Delete ${prompts}`,
      };
    }
    case 'topic': {
      const count = pending.topic.active_count;
      return {
        question: `Delete topic “${pending.topic.name}”`,
        description: count
          ? `Its ${pluralCount(count, 'active prompt')}, other prompts and subtopics stay, without a topic.`
          : 'Its prompts and subtopics stay, without a topic.',
        confirm: 'Delete topic',
      };
    }
    default: {
      const unhandled: never = pending;
      return unhandled;
    }
  }
}

export function deleteRequest(
  pending: PendingDelete | null,
  onConfirm: () => void,
): ConfirmRequest | null {
  if (!pending) return null;
  const { question, description, confirm } = copy(pending);
  return { question, body: description, confirmLabel: confirm, destructive: true, onConfirm };
}
