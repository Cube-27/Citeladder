'use client';

import { useEntitlement } from '@/lib/billing/entitlement-context';
import { GROWTH_AGENT_CAPABILITY } from '@/lib/config/billing';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Whether this member can send to the Agent, and why not when they cannot.
 * The server re-checks role, capability and funding on every turn; this only
 * decides what the composer offers and explains.
 */
export type AgentAccess =
  | { canSend: true }
  | { canSend: false; reason: 'role' | 'capability'; message: string };

export function useAgentAccess(): AgentAccess {
  const mayRun = useWorkspaceCapability('run');
  const { hasCapability } = useEntitlement();
  if (!mayRun)
    return {
      canSend: false,
      reason: 'role',
      message: 'Your workspace role can read chats but not ask the agent.',
    };
  // The persisted capability key stays `growth_agent` for billing continuity.
  if (!hasCapability(GROWTH_AGENT_CAPABILITY))
    return {
      canSend: false,
      reason: 'capability',
      message: 'Your plan does not include the agent. Upgrade in Billing to ask it.',
    };
  return { canSend: true };
}
