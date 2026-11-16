import type { ActionGroup, ActionTargetKind } from '@citeladder/contracts/actions';
import type { IssueSection } from '@citeladder/contracts';

/**
 * Agent workspace client policy: page sizes and the polling cadence that
 * follows an active turn. Reads never run the agent, so the UI polls the
 * persisted chat until the run reaches a terminal state.
 */
/**
 * Streamed reply text waits twice its last repaint's duration before the next,
 * within these bounds, so Markdown is not re-parsed per token and a long reply
 * repaints less often.
 */
export const AGENT_STREAM_REPAINT_MS = { floor: 50, cap: 250 } as const;
/** Live-turn listeners hear once a frame; a hidden tab pauses frames, so this timeout backs them up. */
export const AGENT_STREAM_NOTIFY_FALLBACK_MS = 100;

export const AGENT_CHAT_PAGE_SIZE = 30;
/** A turn without this tab's stream is polled quickly at first, then less often. */
export const AGENT_RUN_POLL_STEPS: readonly { untilMs: number; everyMs: number }[] = [
  { untilMs: 30_000, everyMs: 2_000 },
  { untilMs: 120_000, everyMs: 5_000 },
];
export const AGENT_RUN_POLL_MAX_MS = 10_000;
/** A page chat is polled at this cadence while its page is being read. */
export const AGENT_PAGE_FETCH_POLL_MS = 2_000;
/** The chat list refreshes at this cadence while any listed chat has a turn running. */
export const AGENT_CHAT_LIST_POLL_MS = 5_000;
/**
 * A turn's stream that delivers no frame, keep-alives included, for this long
 * is closed and the persisted read takes over: twice the server's 15-second
 * `stream_heartbeat_seconds`.
 */
export const AGENT_STREAM_IDLE_MS = 30_000;
/**
 * A busy instance refuses a turn's stream with 429 and `Retry-After`; the
 * browser re-posts after that delay (this one when the header is missing), up
 * to this many attempts, then leaves the queued turn to the runner.
 */
export const AGENT_RUN_RETRY = { defaultDelayMs: 15_000, maxAttempts: 8 } as const;
/** Distance from the end that still counts as following the conversation. */
export const AGENT_FOLLOW_LATEST_GAP_PX = 96;
/**
 * One Actions list read per status: the server's largest page, so a view's
 * tree is built from every Action it holds; beyond it the list says so.
 */
export const ACTIONS_LIST_READ_LIMIT = 200;
/** One Issues read per Issues tab for the Actions list: the server's largest page. */
export const ACTIONS_ISSUE_READ_LIMIT = 200;
/** A category of the Actions list shows this many rows, then "Show more" adds as many again. */
export const ACTIONS_CATEGORY_ROWS = 25;

/** Which goal of the Actions list each Issues tab's defects fall under. */
export const ISSUE_SECTION_GOAL = {
  technical: 'fix_site',
  content: 'own_pages',
  aeo: 'own_pages',
} as const satisfies Record<IssueSection, ActionGroup>;

/**
 * An Action's category in the Actions list: the FIRST rule whose target kinds,
 * approaches and sources (each absent: any) all admit it, else the fallback.
 * Categories are listed in this order.
 */
export const ACTION_CATEGORIES: readonly Readonly<{
  label: string;
  targetKinds?: readonly ActionTargetKind[];
  approaches?: readonly string[];
  families?: readonly string[];
}>[] = [
  { label: 'Internal links', approaches: ['improve_links'] },
  { label: 'Regressed since the last crawl', approaches: ['fix_technical'] },
  { label: "Prompts you don't appear in", targetKinds: ['prompt'] },
  { label: 'Content gaps', targetKinds: ['planned_page'] },
  { label: 'Content gaps', targetKinds: ['page'], families: ['content_optimization'] },
  { label: 'Your pages', targetKinds: ['page'] },
  { label: 'Search queries', targetKinds: ['query'] },
  { label: 'Cited pages without you', targetKinds: ['earned_page'] },
  { label: 'Products', targetKinds: ['product'] },
  { label: 'Product categories', targetKinds: ['category'] },
];
export const ACTION_CATEGORY_FALLBACK = 'Other work';
/** An Issues row's category in the Actions list, by its rule's `category`. */
export const ISSUE_CATEGORY_LABEL: ReadonlyMap<string, string> = new Map([
  ['indexability', 'Crawling and indexing'],
  ['architecture', 'Site structure'],
  ['security', 'Security'],
  ['performance', 'Performance'],
  ['metadata', 'Page metadata'],
  ['content', 'Page content'],
  ['citability', 'Citability'],
  ['structured_data', 'Structured data'],
]);
export const ISSUE_CATEGORY_FALLBACK = 'Other website issues';
/** The composer's + menu lists this many top open Actions under Actions. */
export const AGENT_TOP_ACTIONS = 3;
/** Debounce for the sidebar chat search. */
export const AGENT_CHAT_SEARCH_DEBOUNCE_MS = 250;
/** Debounce for Analyze a page's page search, which the server answers. */
export const ANALYZE_PAGE_SEARCH_DEBOUNCE_MS = 250;
/**
 * Actions one `@` search asks the server for, across every status. The menu
 * shows fewer; the rest narrow instantly while the next search loads.
 */
export const AGENT_MENTION_SEARCH_LIMIT = 20;
/** Debounce for the `@` menu's Action search, which the server answers. */
export const AGENT_MENTION_SEARCH_DEBOUNCE_MS = 200;
/** The composer starts one line tall and grows upward to this many lines, then scrolls. */
export const AGENT_COMPOSER_MAX_ROWS = 8;
/**
 * A paste at least this long becomes a "Pasted text" attachment instead of
 * filling the field (within the server's attachment limits).
 */
export const AGENT_PASTE_ATTACHMENT_MIN_CHARS = 2_000;
/** Top open Actions a briefing mentions (within the server's `mentions_max`). */
export const AGENT_BRIEFING_ACTIONS = 5;
