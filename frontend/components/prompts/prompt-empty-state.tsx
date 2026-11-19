import { MessageSquarePlus } from 'lucide-react';

import { StateBlock } from '@/components/ui/state-block';

import { AddPromptsMenu, type AddPromptsHandlers } from './prompt-toolbar';

/**
 * Shown when the active project's prompt set has no prompts. Onboarding creates
 * none, so this is the first thing a new project's library shows. It carries
 * "Add prompts" itself (the masthead leaves it out meanwhile). A role that may
 * not add prompts reads that there are none, with nothing to choose.
 */
export function PromptEmptyState({
  add,
}: Readonly<{
  /** The ways to add prompts, for a role that may; omitted otherwise. */
  add?: AddPromptsHandlers;
}>) {
  if (!add) {
    return <StateBlock kind="empty" icon={MessageSquarePlus} heading="No prompts tracked yet" />;
  }
  return (
    <StateBlock
      kind="empty"
      icon={MessageSquarePlus}
      heading="Choose the questions you want to track"
      action={<AddPromptsMenu {...add} />}
    />
  );
}
