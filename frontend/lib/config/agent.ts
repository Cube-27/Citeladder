/**
 * Agent workspace client policy: page sizes and the polling cadence that
 * follows an active turn. Reads never run the agent, so the UI polls the
 * persisted chat until the run reaches a terminal state.
 */
export const AGENT_CHAT_PAGE_SIZE = 30;
export const AGENT_ACTIONS_PAGE_SIZE = 50;
export const AGENT_RUN_POLL_MS = 2_000;
/** New chat shows this many top Actions under "Work on this". */
export const AGENT_TOP_ACTIONS = 3;
/** Debounce for the sidebar chat search. */
export const AGENT_CHAT_SEARCH_DEBOUNCE_MS = 250;
