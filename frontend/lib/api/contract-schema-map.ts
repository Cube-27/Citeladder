/**
 * The response contracts the UI consumes from Python-owned route families,
 * mapped to their OpenAPI component. TypeScript-owned families serve the
 * contracts themselves, so they have no Python component to drift from.
 * Covers the top-level response objects AND the item shapes of list/page
 * wrappers (the wrappers themselves add no new field sets). A mapped entry
 * that cannot be resolved on either side fails the guard — when a response
 * contract is added or renamed, update this table in the same change.
 */
export const CONTRACT_SCHEMA_MAP = {
  // Auth, workspaces and projects are owned and served by the TypeScript API.
  // Providers
  providerConnectionSchema: 'ProviderConnectionResponse',
  connectionTestResultSchema: 'ProviderConnectionTestResponse',
  providerCatalogSchema: 'ProviderCatalogResponse',
  auditSchema: 'AuditResponse',
  executionSchema: 'AuditTaskResponse',
  // Integrations are owned and served by the TypeScript API.
  // Search Intelligence: the Python review route still publishes RunResponse;
  // every other response is served by the TypeScript API.
  searchRunSchema: 'RunResponse',
  // Authenticated provider projection (distinct from the public catalog)
  providerConnectionStatesSchema: 'ProviderConnectionStatesResponse',
  providerConnectionStateEntrySchema: 'ProviderConnectionStateResponse',
  providerProbeSchema: 'ProviderProbeResponse',
  // Agent chats, outputs and revisions
  agentRunSchema: 'RunView',
  agentRevisionSchema: 'RevisionView',
  agentOutputSchema: 'OutputView',
  agentMessageSchema: 'MessageView',
  agentChatSummarySchema: 'ChatSummary',
  agentChatsPageSchema: 'ChatsPage',
  agentChatDetailSchema: 'ChatDetail',
  agentTurnAcceptedSchema: 'TurnAccepted',
  agentRevisionsPageSchema: 'RevisionsPage',
  agentSkillSchema: 'SkillView',
  agentSkillCatalogSchema: 'SkillCatalog',
  agentInstructionsSchema: 'InstructionsView',
  // Site Health controls and reads are owned and served by the TypeScript API.
} as const;

export type ContractSchemaName = keyof typeof CONTRACT_SCHEMA_MAP;
