/**
 * Composer commands, typed inline: `/` opens the + menu on the skills and `@`
 * mentions an Action. A command token starts at the beginning of the message
 * or after whitespace and runs to the caret; picking an option replaces the
 * token. A pasted link to an Action's page becomes a mention too.
 */
import type { ActionStatus } from '@/lib/api/actions';

type CommandTrigger = '/' | '@';

export type CommandToken = { trigger: CommandTrigger; query: string; start: number; end: number };

export type CommandOption = {
  key: string;
  label: string;
  detail?: string;
  /** An Action option's current status, shown beside its label. */
  status?: ActionStatus;
  /** Text that replaces the token; empty removes it. */
  replacement: string;
};

export type Mention = { id: string; label: string };

/** Options one command menu shows at most. */
const COMMAND_OPTIONS_MAX = 6;

const TOKEN = /(^|\s)([/@])([^\s/@]{0,40})$/;

export function tokenAt(text: string, caret: number): CommandToken | null {
  const match = TOKEN.exec(text.slice(0, caret));
  if (!match) return null;
  // Every group takes part in a match; the lead and query may be empty.
  const [, lead = '', trigger, query = ''] = match;
  return {
    trigger: trigger === '@' ? '@' : '/',
    query,
    start: match.index + lead.length,
    end: caret,
  };
}

/** The message with the token replaced, and where the caret lands. */
export function applyOption(
  text: string,
  token: CommandToken,
  option: CommandOption,
): { text: string; caret: number } {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end).replace(/^ /, '');
  const insert = option.replacement ? `${option.replacement} ` : '';
  return { text: before + insert + after, caret: before.length + insert.length };
}

/** Options whose label contains every word of the query, case-insensitively. */
export function matchOptions(options: readonly CommandOption[], query: string): CommandOption[] {
  const words = query
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
  return options
    .filter((option) => {
      const haystack = `${option.label} ${option.detail ?? ''}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, COMMAND_OPTIONS_MAX);
}

const LINK = /https?:\/\/[^\s<>"'`]+/giu;
const TRAILING = new Set('.,;:!?)]');
const ACTION_PATH =
  /^\/agent\/actions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/iu;

/** A link in the message to an Action's page in this app. */
export type ActionLink = { url: string; actionId: string };

/**
 * Links to an Action's page on `origin`, once each. A link that names another
 * project is left alone: a mention can only name an Action of this one.
 */
export function actionLinks(
  text: string,
  { origin, projectId }: Readonly<{ origin: string; projectId: string }>,
): ActionLink[] {
  const links = new Map<string, ActionLink>();
  for (const [raw] of text.matchAll(LINK)) {
    // Sentence punctuation after a pasted link is not part of it.
    let end = raw.length;
    while (end > 0 && TRAILING.has(raw.charAt(end - 1))) end--;
    const url = raw.slice(0, end);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const id = ACTION_PATH.exec(parsed.pathname)?.[1];
    const project = parsed.searchParams.get('project');
    if (parsed.origin !== origin || !id || (project !== null && project !== projectId)) continue;
    links.set(url, { url, actionId: id.toLowerCase() });
  }
  return [...links.values()];
}

/**
 * The message with each resolved link that is still in it replaced by
 * `@label`, and the mentions it adds, up to `max` mentions in all. A link to
 * an Action already mentioned is replaced without a second mention; one past
 * the bound stays as typed.
 */
export function withLinkMentions({
  text,
  mentions,
  resolved,
  max,
}: Readonly<{
  text: string;
  mentions: readonly Mention[];
  resolved: readonly { url: string; mention: Mention }[];
  max: number;
}>): { text: string; mentions: Mention[] } {
  let next = text;
  const kept = [...mentions];
  for (const { url, mention } of resolved) {
    if (!next.includes(url)) continue;
    if (!kept.some((item) => item.id === mention.id)) {
      if (kept.length >= max) continue;
      kept.push(mention);
    }
    next = next.replaceAll(url, `@${mention.label}`);
  }
  return { text: next, mentions: kept };
}
