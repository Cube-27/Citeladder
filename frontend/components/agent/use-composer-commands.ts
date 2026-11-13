import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import type {
  ComposerCommands,
  ComposerPastes,
  Mention,
  PastedText,
} from '@/components/agent/command-menu';
import { matchOptions, type CommandOption, type CommandToken } from '@/lib/agent/composer-commands';
import { approachLabel } from '@/lib/agent/vocabulary';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { actionsQueries } from '@/lib/api/actions';
import { AGENT_PASTE_ATTACHMENT_MIN_CHARS } from '@/lib/config/agent';

const ACTION = 'action:';

/**
 * The composer's `/` skill command, `@` Action mentions and pasted-text
 * attachments. Mentions are typed Action IDs the server resolves and
 * authorizes when the turn is queued; their labels here are only for display.
 */
export function useComposerCommands({
  workspaceId,
  projectId,
}: Readonly<{
  workspaceId: string;
  projectId: string;
}>): ComposerCommands & {
  pastes: ComposerPastes;
  clear: () => void;
  restore: (saved: { mentions: readonly Mention[]; pastes: readonly PastedText[] }) => void;
  skillPicker: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: () => void;
    onCloseAutoFocus: (event: Event) => void;
  };
} {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [pastes, setPastes] = useState<ComposerPastes['items'][number][]>([]);
  // A paste has no id of its own; a key per paste lets one be removed.
  const pasteCount = useRef(0);
  const keyed = (text: string) => ({ key: `paste-${++pasteCount.current}`, text });
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const removeCommand = useRef<(() => void) | null>(null);
  const restoreFocus = useRef<(() => void) | null>(null);
  // Most messages mention nothing, so the pool loads only once `@` is typed.
  const [poolWanted, setPoolWanted] = useState(false);
  const onTrigger = useCallback((trigger: CommandToken['trigger']) => {
    if (trigger === '@') setPoolWanted(true);
  }, []);
  // The mention bound the server enforces travels on the catalog the composer screens load.
  const limits = useAgentCatalog().limits;
  const mentionsMax = limits?.mentions_max ?? null;
  const actions = useQuery({
    ...actionsQueries.mentionPool({ workspaceId, projectId }),
    enabled: poolWanted && Boolean(workspaceId && projectId),
  });

  const mentioned = new Set(mentions.map((mention) => mention.id));
  const actionOptions: CommandOption[] = (actions.data?.items ?? [])
    .filter((action) => !mentioned.has(action.id))
    .map((action) => ({
      key: `${ACTION}${action.id}`,
      label: action.target_label,
      detail: approachLabel(action.approach) ?? undefined,
      replacement: `@${action.target_label}`,
    }));

  return {
    options: (token) => {
      if (token.trigger === '/') return [];
      // Until the catalog lists the bound, no mention is offered that the server might refuse.
      if (mentionsMax === null || mentions.length >= mentionsMax) return [];
      return matchOptions(actionOptions, token.query);
    },
    onTrigger,
    onPick: (option) => {
      setMentions((current) => [
        ...current,
        { id: option.key.slice(ACTION.length), label: option.label },
      ]);
    },
    mentions,
    openSkillPicker: (remove, focus) => {
      removeCommand.current = remove;
      restoreFocus.current = focus;
      setSkillPickerOpen(true);
    },
    closeSkillPicker: () => {
      if (!skillPickerOpen) return false;
      setSkillPickerOpen(false);
      removeCommand.current = null;
      return true;
    },
    skillPicker: {
      open: skillPickerOpen,
      onOpenChange: (open) => {
        setSkillPickerOpen(open);
        if (!open) removeCommand.current = null;
      },
      onSelect: () => {
        removeCommand.current?.();
        removeCommand.current = null;
      },
      onCloseAutoFocus: (event) => {
        if (!restoreFocus.current) return;
        event.preventDefault();
        restoreFocus.current();
        restoreFocus.current = null;
      },
    },
    onRemoveMention: (id) => setMentions((current) => current.filter((item) => item.id !== id)),
    pastes: {
      items: pastes,
      attachments: pastes.map(({ text }): PastedText => ({ kind: 'pasted_text', text })),
      add: (text) => {
        // Short, past a bound the server enforces, or before the catalog lists them: plain text.
        const fits =
          limits != null &&
          text.length >= AGENT_PASTE_ATTACHMENT_MIN_CHARS &&
          text.length <= limits.attachment_max_chars &&
          pastes.length < limits.attachments_max;
        if (fits) {
          const paste = keyed(text);
          setPastes((current) => [...current, paste]);
        }
        return fits;
      },
      remove: (key) => setPastes((current) => current.filter((paste) => paste.key !== key)),
    },
    clear: () => {
      setMentions([]);
      setPastes([]);
    },
    restore: (saved) => {
      setMentions([...saved.mentions]);
      setPastes(saved.pastes.map(({ text }) => keyed(text)));
    },
  };
}
