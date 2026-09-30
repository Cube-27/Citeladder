/**
 * Agent workspace client policy: page sizes and the polling cadence that
 * follows an active turn. Reads never run the agent, so the UI polls the
 * persisted chat until the run reaches a terminal state.
 */
export const AGENT_CHAT_PAGE_SIZE = 30;
export const AGENT_ACTIONS_PAGE_SIZE = 50;
export const AGENT_RUN_POLL_MS = 2_000;
/** Distance from the end that still counts as following the conversation. */
export const AGENT_FOLLOW_LATEST_GAP_PX = 96;
/** New chat shows this many top Actions under "Work on this". */
export const AGENT_TOP_ACTIONS = 3;
/** Debounce for the sidebar chat search. */
export const AGENT_CHAT_SEARCH_DEBOUNCE_MS = 250;
/** Actions one message may @-mention (the server enforces the same bound). */
export const AGENT_MENTIONS_MAX = 5;
/** Top open Actions a briefing mentions (within AGENT_MENTIONS_MAX). */
export const AGENT_BRIEFING_ACTIONS = 5;
