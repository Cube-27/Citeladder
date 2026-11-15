import { ApiError } from '@/lib/api/errors';
import { mutationNoticeForError, type MutationNotice } from '@/lib/api/mutation-notice';
import { SUGGESTION_CONFLICT_COPY } from '@/lib/agent/vocabulary';

/**
 * The step that fixes a refused Agent write, offered beside its notice: a new
 * chat (the turn limit), or a model to run on (no credits and no model).
 */
export type AgentRecovery = 'new-chat' | 'connect-model' | null;

/** A refused Agent write as the shared failure notice, and the step that fixes it. */
export type AgentWriteFailure = MutationNotice & { recovery: AgentRecovery };

type AgentCopy = { message: string; recovery: AgentRecovery };

const CODED: {
  agent_funding_unavailable: AgentCopy;
  [code: string]: AgentCopy;
} = {
  agent_funding_unavailable: {
    message: 'There are not enough AI credits and no connected model to run the agent.',
    recovery: 'connect-model',
  },
  agent_model_unavailable: {
    message: 'The connected AI model is unavailable. Check Providers in Settings, then try again.',
    recovery: null,
  },
  agent_run_active: {
    message: 'Wait for the agent to finish its current turn, then try again.',
    recovery: null,
  },
  agent_turn_limit: {
    message: 'This chat has reached its turn limit. Start a new chat to continue.',
    recovery: 'new-chat',
  },
  agent_output_conflict: {
    message: 'The output changed since you opened it. Review the latest revision and try again.',
    recovery: null,
  },
};

function agentCopy(error: unknown): AgentCopy | undefined {
  if (!(error instanceof ApiError)) return undefined;
  // The server says why it refused this suggestion change; its words are the copy.
  if (error.code === 'agent_suggestion_conflict')
    return { message: error.message.trim() || SUGGESTION_CONFLICT_COPY, recovery: null };
  const coded = error.code ? CODED[error.code] : undefined;
  if (coded) return coded;
  if (error.status === 402) return CODED.agent_funding_unavailable;
  if (error.status === 429)
    return {
      message: 'The workspace has reached its agent usage limit. Try again later.',
      recovery: null,
    };
  return undefined;
}

/** Whether a refused write means the page document moved on since it was read. */
export function isOutputConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'agent_output_conflict';
}

/**
 * The notice for a refused Agent write: the A4 notice for `action`, with the
 * Agent's own copy for the refusals it knows.
 */
export function agentWriteFailure(error: unknown, action: string): AgentWriteFailure {
  const notice = mutationNoticeForError(error, { action });
  const copy = agentCopy(error);
  if (!copy) return { ...notice, recovery: null };
  return { ...notice, message: copy.message, recovery: copy.recovery };
}
