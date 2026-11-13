import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ComposerCommands, ComposerPastes, PastedText } from '@/components/agent/command-menu';
import {
  actionLinks,
  matchOptions,
  withLinkMentions,
  type CommandOption,
  type CommandToken,
  type Mention,
} from '@/lib/agent/composer-commands';
import { approachLabel } from '@/lib/agent/vocabulary';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { actionsQueries } from '@/lib/api/actions';
import {
  AGENT_MENTION_SEARCH_DEBOUNCE_MS,
  AGENT_PASTE_ATTACHMENT_MIN_CHARS,
} from '@/lib/config/agent';
import { useDebounced } from '@/lib/use-debounced';

const ACTION = 'action:';

/** A message ready to send: its text with resolved Action links replaced, every mention's id and its pastes. */
type Prepared = { message: string; mentions: string[]; attachments: PastedText[] };

/** The message to send, and how to rewrite the draft it came from. */
type Draft = Readonly<{ message: string; edit: (change: (current: string) => string) => void }>;

export type ComposerMenuState = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened by `/`: the menu is the skills list alone. */
  skillsOnly: boolean;
  onSelect: () => void;
  onCloseAutoFocus: (event: Event) => void;
};

/**
 * The composer's `/` skill command, `@` Action mentions and pasted-text
 * attachments. Mentions are typed Action IDs the server resolves and
 * authorizes when the turn is queued; their labels here are only for display.
 * A pasted link to an Action of this project becomes a mention, on paste or
 * at the latest on send.
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
  /**
   * Resolves the message's Action links, then sends; at once when it has none.
   * Resolved links become `@label` in the draft too, unless it changed meanwhile.
   */
  prepare: (draft: Draft, send: (prepared: Prepared) => void) => void;
  /** A send is waiting for its Action links: the composer is pending. */
  resolving: boolean;
  /** The composer's + menu; `/` opens it on its Skills submenu. */
  menu: ComposerMenuState;
  scope: { workspaceId: string; projectId: string };
} {
  const client = useQueryClient();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [pastes, setPastes] = useState<ComposerPastes['items'][number][]>([]);
  // A paste has no id of its own; a key per paste lets one be removed.
  const pasteCount = useRef(0);
  const keyed = (text: string) => ({ key: `paste-${++pasteCount.current}`, text });
  const latestMentions = useRef(mentions);
  useEffect(() => {
    latestMentions.current = mentions;
  }, [mentions]);
  const [resolving, setResolving] = useState(false);
  const resolvingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [skillsOnly, setSkillsOnly] = useState(false);
  const removeCommand = useRef<(() => void) | null>(null);
  const restoreFocus = useRef<(() => void) | null>(null);
  // Most messages mention nothing, so nothing is searched until `@` is typed.
  const [search, setSearch] = useState<string | null>(null);
  const onTrigger = useCallback((trigger: CommandToken['trigger'], query: string) => {
    if (trigger === '@') setSearch(query);
  }, []);
  const searched = useDebounced(search, AGENT_MENTION_SEARCH_DEBOUNCE_MS);
  // The mention bound the server enforces travels on the catalog the composer screens load.
  const limits = useAgentCatalog().limits;
  const mentionsMax = limits?.mentions_max ?? null;
  const actions = useQuery({
    ...actionsQueries.mentionSearch({ workspaceId, projectId }, searched ?? ''),
    enabled: searched !== null && Boolean(workspaceId && projectId),
    // The last results narrow under the typed text while the next search loads.
    placeholderData: keepPreviousData,
  });

  const mentioned = new Set(mentions.map((mention) => mention.id));
  const actionOptions: CommandOption[] = (actions.data?.items ?? [])
    .filter((action) => !mentioned.has(action.id))
    .map((action) => ({
      key: `${ACTION}${action.id}`,
      label: action.target_label,
      detail: approachLabel(action.approach) ?? undefined,
      status: action.status,
      replacement: `@${action.target_label}`,
    }));

  /** Each link to an Action of this project, with the label its read gives; others are dropped. */
  const resolveLinks = async (text: string) => {
    const links = actionLinks(text, { origin: window.location.origin, projectId });
    const resolved = await Promise.all(
      links.map(async ({ url, actionId }) => {
        try {
          const action = await client.fetchQuery(actionsQueries.detail(workspaceId, actionId));
          return action.project_id === projectId
            ? [{ url, mention: { id: action.id, label: action.target_label } }]
            : [];
        } catch {
          // Not found or not readable: the link stays as typed.
          return [];
        }
      }),
    );
    return resolved.flat();
  };

  /** Applies resolved links to `text` and the current mentions. */
  const applyLinks = (text: string, resolved: Awaited<ReturnType<typeof resolveLinks>>) => {
    const next = withLinkMentions({
      text,
      mentions: latestMentions.current,
      resolved,
      max: mentionsMax ?? 0,
    });
    latestMentions.current = next.mentions;
    setMentions(next.mentions);
    return next.text;
  };

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
    onPaste: (pasted, edit) => {
      void resolveLinks(pasted).then((resolved) => {
        if (resolved.length) edit((current) => applyLinks(current, resolved));
      });
    },
    prepare: ({ message, edit }, send) => {
      // One send at a time: a second press while links resolve would start a second turn.
      if (resolvingRef.current) return;
      const attachments = pasteAttachments(pastes);
      const finish = (text: string) =>
        send({
          message: text,
          mentions: latestMentions.current.map((mention) => mention.id),
          attachments,
        });
      if (!actionLinks(message, { origin: window.location.origin, projectId }).length) {
        finish(message);
        return;
      }
      resolvingRef.current = true;
      setResolving(true);
      void resolveLinks(message)
        .then((resolved) => {
          const text = applyLinks(message, resolved);
          // Typing while the links resolved is kept.
          if (text !== message)
            edit((current) => (current.trim() === message.trim() ? text : current));
          finish(text);
        })
        .finally(() => {
          resolvingRef.current = false;
          setResolving(false);
        });
    },
    resolving,
    mentions,
    openSkillPicker: (remove, focus) => {
      removeCommand.current = remove;
      restoreFocus.current = focus;
      setMenuOpen(true);
      setSkillsOnly(true);
    },
    closeSkillPicker: () => {
      if (!menuOpen) return false;
      setMenuOpen(false);
      removeCommand.current = null;
      return true;
    },
    menu: {
      open: menuOpen,
      onOpenChange: (open) => {
        setMenuOpen(open);
        // Only the + button opens it here; the closing menu keeps its face.
        if (open) setSkillsOnly(false);
        else removeCommand.current = null;
      },
      skillsOnly,
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
    scope: { workspaceId, projectId },
    onRemoveMention: (id) => setMentions((current) => current.filter((item) => item.id !== id)),
    pastes: {
      items: pastes,
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
export type ComposerState = ReturnType<typeof useComposerCommands>;

/** The pastes as the request sends them. */
function pasteAttachments(pastes: ComposerPastes['items']): PastedText[] {
  return pastes.map(({ text }) => ({ kind: 'pasted_text', text }));
}
