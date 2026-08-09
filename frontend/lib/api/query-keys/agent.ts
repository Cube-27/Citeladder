export const agentKeys = {
  all: ['agent'] as const,
  capabilities: () => ['agent', 'capabilities'] as const,
  conversations: (projectId: string) => ['agent', 'conversations', projectId] as const,
  conversation: (projectId: string, conversationId: string) =>
    ['agent', 'conversation', projectId, conversationId] as const,
  tasks: (projectId: string) => ['agent', 'tasks', projectId] as const,
  task: (projectId: string, runId: string) => ['agent', 'task', projectId, runId] as const,
};
