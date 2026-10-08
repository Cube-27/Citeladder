'use client';

/**
 * Live display of turns this tab started. Admission opens one streamed request
 * per accepted run; its events show the agent's steps and the reply and
 * document as they are written. The stream is display only: the persisted chat
 * read stays the record, and a dropped stream falls back to polling it.
 */
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import { agentTurnEventSchema } from '@citeladder/contracts/agent';
import { API_BASE_URL, INTERACTIVE_EXECUTION_REQUEST_TIMEOUT_MS } from '@/lib/config/operational';
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
  /** The newest respond step's text; cleared when a later step starts. */
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
  if (event.type === 'step')
    return {
      ...turn,
      step: event,
      // Text belongs to the step that wrote it; a new step supersedes it.
      text: turn.text && turn.text.ordinal < event.ordinal ? null : turn.text,
    };
  if (event.type === 'text') return { ...turn, text: event };
  return turn;
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

/** Opens the run's interactive stream; execution never depends on it staying open. */
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
    signal: AbortSignal.timeout(INTERACTIVE_EXECUTION_REQUEST_TIMEOUT_MS),
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
