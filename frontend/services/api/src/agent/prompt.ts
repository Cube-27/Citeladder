/** Pure assembly: mandatory input is exact; optional records are removed whole. */
import type { z } from 'zod';
import { AgentError, budgetSchema } from './contracts.ts';
import type { ModelRequest } from './model-calls.ts';

export type Observation = { text: string };
export function assemblePrompt(input: {
  system: string;
  schema: ModelRequest['schema'];
  request: string;
  context: string;
  revision: unknown;
  history: { role: string; content: string }[];
  historyLimited: boolean;
  observations: Observation[];
  budget: z.infer<typeof budgetSchema>;
}) {
  const omissions: string[] = input.historyLimited ? ['history_query_limit'] : [];
  const history = input.history.map((message, index) => {
    if (message.content.length <= input.budget.history_message_max_chars) return message;
    omissions.push(`history_message:${index}:content_size_limit`);
    return {
      ...message,
      // Cut by code point so a surrogate pair is never split.
      content: `${[...message.content].slice(0, input.budget.history_message_max_chars).join('')}\n[message shortened]`,
    };
  });
  const observations = [...input.observations];
  const context = JSON.parse(input.context);
  const envelope = () => ({
    request: input.request,
    context,
    current_revision: input.revision,
    history,
    observations: observations.map(({ text }) => text),
    omissions,
  });
  const request = () => ({
    system: input.system,
    user: JSON.stringify(envelope()),
    schema: input.schema,
  });
  const size = () => JSON.stringify(request()).length;
  while (size() > input.budget.transcript_max_chars && history.length) {
    history.shift();
    if (!omissions.includes('oldest_history_messages')) omissions.push('oldest_history_messages');
  }
  while (size() > input.budget.transcript_max_chars && observations.length) {
    observations.shift();
    if (!omissions.includes('oldest_tool_observations')) omissions.push('oldest_tool_observations');
  }
  if (size() > input.budget.transcript_max_chars)
    throw new AgentError(input.revision ? 'output_context_size_limit' : 'context_size_limit');
  return {
    request: request(),
    omissions,
    serializedChars: size(),
  };
}
