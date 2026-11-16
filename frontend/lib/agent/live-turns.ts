/**
 * Turns this tab started. Admission opens one streamed request per accepted
 * run, and the turn runs inside that request: it lives in this module, so
 * moving around the app keeps it running, while closing the tab ends the turn
 * as interrupted. Its events show the agent's calls and reads, its thinking
 * summary, and the reply and document as they are written; the persisted chat
 * read stays the record.
 */
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import { agentTurnEventSchema } from '@citeladder/contracts/agent';
import { retryAfterSeconds } from '@citeladder/contracts/retry-after';
import {
  AGENT_RUN_RETRY,
  AGENT_STREAM_IDLE_MS,
  AGENT_STREAM_NOTIFY_FALLBACK_MS,
} from '@/lib/config/agent';
import { API_BASE_URL } from '@/lib/config/operational';
import { readSseResponse, streamHeaders } from '@/lib/sse/use-event-stream';

export type TurnEvent = z.infer<typeof agentTurnEventSchema>;
type ToolEvent = Extract<TurnEvent, { type: 'tool' }>;
/** One call's latest state; calls from one model response run together. */
type LiveTool = Omit<ToolEvent, 'type'>;
/** Text built from one model call's deltas; each call writes its own segment. */
type Written = { ordinal: number; text: string };

export type LiveTurn = {
  startedAt: number;
  /** True while the stream is open; polling resumes when it closes. */
  connected: boolean;
  /** The ordinal of the newest model call. */
  step: number | null;
  /** The reply so far, one segment per model call that wrote, until the saved reply arrives. */
  reply: Written[];
  /** The document being saved, so far. */
  document: { title: string | null; body: string | null } | null;
  /** Every call this turn, in the order they started. */
  tools: LiveTool[];
  /** Each call's thinking summary, in order. */
  thinking: Written[];
};

export function liveTurn(startedAt: number): LiveTurn {
  return {
    startedAt,
    connected: true,
    step: null,
    reply: [],
    document: null,
    tools: [],
    thinking: [],
  };
}

/** Appends a delta to its call's segment; a later call starts a new one, so earlier text never moves. */
function appended(segments: readonly Written[], { ordinal, text }: Written): Written[] {
  const last = segments.at(-1);
  return last?.ordinal === ordinal
    ? [...segments.slice(0, -1), { ordinal, text: last.text + text }]
    : [...segments, { ordinal, text }];
}

// Turns this tab is showing, with each run's chat; only the most recent few are kept.
const KEEP = 20;
const turns = new Map<string, LiveTurn>();
const chatOf = new Map<string, string>();
const listeners = new Set<() => void>();
const closeListeners = new Set<() => void>();
let frame: number | undefined;
let fallback: ReturnType<typeof setTimeout> | undefined;

function notify() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  clearTimeout(fallback);
  frame = undefined;
  fallback = undefined;
  for (const listener of listeners) listener();
}

/** Listeners hear once a frame however many events arrive; a hidden tab pauses frames, so a timeout backs them up. */
function notifyNextFrame() {
  if (fallback !== undefined) return;
  frame = requestAnimationFrame(notify);
  fallback = setTimeout(notify, AGENT_STREAM_NOTIFY_FALLBACK_MS);
}

function update(runId: string, change: (turn: LiveTurn) => LiveTurn) {
  const current = turns.get(runId);
  if (current) turns.set(runId, change(current));
}

/** `from: 0` replaces the body; a delta that does not continue it is dropped until the next full snapshot. */
function withDocument(turn: LiveTurn, event: Extract<TurnEvent, { type: 'document_delta' }>) {
  if (event.from === 0) return { ...turn, document: { title: event.title, body: event.text } };
  const body = turn.document?.body;
  if (body?.length !== event.from) return turn;
  return { ...turn, document: { title: event.title, body: body + (event.text ?? '') } };
}

/** Folds one stream event into the turn's live view. */
export function applyTurnEvent(turn: LiveTurn, event: TurnEvent): LiveTurn {
  switch (event.type) {
    case 'step':
      return { ...turn, step: event.ordinal };
    case 'reply_delta':
      return { ...turn, reply: appended(turn.reply, event) };
    case 'thinking':
      return { ...turn, thinking: appended(turn.thinking, event) };
    case 'document_delta':
      return withDocument(turn, event);
    case 'tool': {
      const tool = {
        ordinal: event.ordinal,
        call_id: event.call_id,
        tool: event.tool,
        status: event.status,
        target: event.target,
      };
      const known = turn.tools.some((item) => item.call_id === tool.call_id);
      return {
        ...turn,
        tools: known
          ? turn.tools.map((item) => (item.call_id === tool.call_id ? tool : item))
          : [...turn.tools, tool],
      };
    }
    // The stream closes after either; the persisted run read then shows how
    // the turn ended, including a failure, so neither changes the live view.
    case 'done':
    case 'error':
      return turn;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Reads the stream until it ends. A stream with no frame, keep-alives
 * included, for the idle bound is aborted, which closes it.
 */
async function read(
  response: Response,
  controller: AbortController,
  onEvent: (event: TurnEvent) => void,
) {
  if (!response.body) return;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), AGENT_STREAM_IDLE_MS);
  };
  arm();
  try {
    await readSseResponse(
      response.body,
      () => false,
      ({ data }) => {
        arm();
        if (!data) return;
        try {
          const parsed = agentTurnEventSchema.safeParse(JSON.parse(data));
          if (parsed.success) onEvent(parsed.data);
        } catch {
          // An unreadable frame is skipped; the persisted read still arrives.
        }
      },
    );
  } finally {
    clearTimeout(idle);
  }
}

/** The 429 `Retry-After` delay in milliseconds, or the default when it gives no positive wait. */
function retryDelayMs(response: Response): number {
  const seconds = retryAfterSeconds(response.headers.get('retry-after'));
  return seconds === undefined ? AGENT_RUN_RETRY.defaultDelayMs : Math.ceil(seconds) * 1000;
}

/**
 * Posts `/run` and reads its stream. A busy instance answers 429: the queued
 * run waits for this retry, so it re-posts after `Retry-After` (a run another
 * request claimed or ended answers done, so a re-post is safe). Any other
 * refusal ends the live turn and the persisted read shows the run.
 */
async function runStream(url: string, workspaceId: string | null, runId: string) {
  for (let attempt = 1; ; attempt += 1) {
    const controller = new AbortController();
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: streamHeaders(workspaceId, null),
      signal: controller.signal,
    });
    if (response.status === 429 && attempt < AGENT_RUN_RETRY.maxAttempts) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs(response));
      });
      continue;
    }
    if (!response.ok) return;
    await read(response, controller, (event) => {
      update(runId, (turn) => applyTurnEvent(turn, event));
      notifyNextFrame();
    });
    return;
  }
}

/** Opens the run's stream; the server's turn limit bounds it, and a silent stream closes after the idle bound. */
export function startLiveTurn(chatId: string, runId: string, workspaceId: string | null) {
  if (turns.has(runId)) return;
  turns.set(runId, liveTurn(Date.now()));
  chatOf.set(runId, chatId);
  for (const stale of [...turns.keys()].slice(0, Math.max(0, turns.size - KEEP))) {
    turns.delete(stale);
    chatOf.delete(stale);
  }
  void runStream(`${API_BASE_URL}/agent/chats/${chatId}/runs/${runId}/run`, workspaceId, runId)
    .catch(() => undefined)
    .finally(() => {
      // Flushed at once, so the close and the last event are never left for a frame.
      update(runId, (turn) => ({ ...turn, connected: false }));
      notify();
      for (const listener of closeListeners) listener();
    });
  notify();
}

/** Whether this tab holds an open stream for the run, so polling can wait. */
export function isLiveTurnConnected(runId: string | null | undefined) {
  return Boolean(runId && turns.get(runId)?.connected);
}

/** Whether this tab holds an open stream for a turn of the chat. */
export function isChatLiveTurnConnected(chatId: string) {
  for (const [runId, chat] of chatOf)
    if (chat === chatId && isLiveTurnConnected(runId)) return true;
  return false;
}

/** Calls `listener` each time one of this tab's streams closes; returns the unsubscribe. */
export function onLiveTurnClosed(listener: () => void) {
  closeListeners.add(listener);
  return () => {
    closeListeners.delete(listener);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders only when the run's stream opens or closes, not on every event. */
export function useLiveTurnConnected(runId: string | null | undefined): boolean | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (runId ? turns.get(runId)?.connected : undefined),
    () => undefined,
  );
}

/** The streamed document's body, so its reader re-renders only when the body changes. */
export function useLiveDocumentBody(runId: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (runId ? (turns.get(runId)?.document?.body ?? null) : null),
    () => null,
  );
}

export function useLiveTurn(runId: string | null | undefined): LiveTurn | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (runId ? turns.get(runId) : undefined),
    () => undefined,
  );
}
