import type { AgentMessage } from '@/lib/api/agent';

/**
 * One saved reply as an ordered list of typed parts (a
 * Turn): the steps it took, the text it wrote, the evidence it cited, the web
 * pages it read, then what it proposed and wrote. A Turn renders the list in
 * order through one switch, so a new part is a new kind, never a new slot.
 */
export type TurnPart =
  | Readonly<{ kind: 'steps'; steps: AgentMessage['steps'] }>
  | Readonly<{ kind: 'text'; markdown: string }>
  | Readonly<{ kind: 'evidence'; refs: AgentMessage['evidence_refs'] }>
  | Readonly<{ kind: 'sources'; sources: AgentMessage['web_sources'] }>
  | Readonly<{ kind: 'outputs' }>;

export function turnParts(message: AgentMessage): TurnPart[] {
  return [
    ...(message.steps.length ? [{ kind: 'steps', steps: message.steps } as const] : []),
    { kind: 'text', markdown: message.content },
    { kind: 'evidence', refs: message.evidence_refs },
    ...(message.web_sources.length
      ? [{ kind: 'sources', sources: message.web_sources } as const]
      : []),
    { kind: 'outputs' },
  ];
}
