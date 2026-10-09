'use client';

/**
 * Turns this tab started. Admission opens one streamed request per accepted
 * run, and the turn runs inside that request: it lives in this module, so
 * moving around the app keeps it running, while closing the tab ends the turn
 * as interrupted. Its events show the agent's steps and the reply and document
 * as they are written; the persisted chat read stays the record.
 */
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import { agentTurnEventSchema } from '@citeladder/contracts/agent';
import { API_BASE_URL } from '@/lib/config/operational';
import { readSseResponse, streamHeaders } from '@/lib/sse/use-event-stream';

type TurnEvent = z.infer<typeof agentTurnEventSchema>;
type Step = Extract<TurnEvent, { type: 'step' }>;
type Text = Extract<TurnEvent, { type: 'text' }>;

export type LiveTurn = {
  startedAt: number;
  /** True while the stream is open; polling resumes when it closes. */
  connected: boolean;
  /** The newest step event. */
  step: Step | null;
  /** The newest written text, kept until a newer text or the saved reply replaces it. */
  text: Text | null;
};

// Turns this tab is showing; only the most recent few are kept.
const KEEP = 20;
const turns = new Map<string, LiveTurn>();
const listeners = new Set<() => void>();

function update(runId: string, change: (turn: LiveTurn) => LiveTurn) {
  const current = turns.get(runId);
  if (!current) return;
  turns.set(runId, change(current));
  for (const listener of listeners) listener();
}

function apply(turn: LiveTurn, event: TurnEvent): LiveTurn {
  switch (event.type) {
    // Text stays through later steps, so a reply never blanks while the agent continues.
    case 'step':
      return { ...turn, step: event };
    case 'text':
      return { ...turn, text: event };
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

async function read(response: Response, onEvent: (event: TurnEvent) => void) {
  if (!response.body) return;
  await readSseResponse(
    response.body,
    () => false,
    ({ data }) => {
      if (!data) return;
      try {
        const parsed = agentTurnEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) onEvent(parsed.data);
      } catch {
        // An unreadable frame is skipped; the persisted read still arrives.
      }
    },
  );
}

/** Opens the run's stream; the server's turn limit bounds it, so it has no timeout of its own. */
export function startLiveTurn(chatId: string, runId: string, workspaceId: string | null) {
  if (turns.has(runId)) return;
  turns.set(runId, { startedAt: Date.now(), connected: true, step: null, text: null });
  for (const stale of [...turns.keys()].slice(0, Math.max(0, turns.size - KEEP)))
    turns.delete(stale);
  void fetch(`${API_BASE_URL}/agent/chats/${chatId}/runs/${runId}/run`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: streamHeaders(workspaceId, null),
  })
    .then((response) => read(response, (event) => update(runId, (turn) => apply(turn, event))))
    .catch(() => undefined)
    .finally(() => update(runId, (turn) => ({ ...turn, connected: false })));
  for (const listener of listeners) listener();
}

/** Whether this tab holds an open stream for the run, so polling can wait. */
export function isLiveTurnConnected(runId: string | null | undefined) {
  return Boolean(runId && turns.get(runId)?.connected);
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

export function useLiveTurn(runId: string | null | undefined): LiveTurn | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (runId ? turns.get(runId) : undefined),
    () => undefined,
  );
}
