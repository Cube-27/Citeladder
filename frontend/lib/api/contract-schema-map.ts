/**
 * The response contracts the UI consumes, mapped to their OpenAPI component.
 * Covers the top-level response objects AND the item shapes of list/page
 * wrappers (the wrappers themselves add no new field sets). A mapped entry
 * that cannot be resolved on either side fails the guard — when a response
 * contract is added or renamed, update this table in the same change.
 */
export const CONTRACT_SCHEMA_MAP = {
  // Auth / workspace / shell
  authResponseSchema: 'AuthResponse',
  registrationResponseSchema: 'RegistrationResponse',
  sessionUserSchema: 'SessionUser',
  workspaceSchema: 'WorkspaceResponse',
  productTourSchema: 'ProductTourResponse',
  oauthStartResponseSchema: 'OAuthStartResponse',
  // Projects / brand
  projectSchema: 'ProjectResponse',
  competitorSchema: 'CompetitorResponse',
  commandCenterSchema: 'CommandCenterResponse',
  brandProfileSchema: 'BrandProfileResponse',
  // Prompts / topics
  promptSchema: 'PromptResponse',
  promptSetSchema: 'PromptSetResponse',
  promptGenerateResponseSchema: 'PromptGenerateResponse',
  topicSchema: 'TopicResponse',
  // Providers
  providerConnectionSchema: 'ProviderConnectionResponse',
  connectionTestResultSchema: 'ProviderConnectionTestResponse',
  providerCatalogSchema: 'ProviderCatalogResponse',
  auditSchema: 'AuditResponse',
  executionSchema: 'AuditTaskResponse',
  executionEvidenceSchema: 'ExecutionEvidenceResponse',
  searchSurfaceEvidenceSchema: 'SearchSurfaceEvidence',
  surfaceEntitySchema: 'SurfaceEntityEvidence',
  aioLinkSchema: 'AioLinkEvidence',
  aioRateSchema: 'AioRateValue',
  aioCompetitorRateSchema: 'AioCompetitorRate',
  surfaceRatesSchema: 'SurfaceRatesResponse',
  visibilitySchema: 'VisibilityResponse',
  visibilityTrendPointSchema: 'VisibilityTrendPoint',
  visibilityEvidenceResponseSchema: 'VisibilityEvidenceResponse',
  // Externally cited pages
  // AI Referrals / performance
  aiReferralsSchema: 'AiReferralsResponse',
  performanceDashboardSchema: 'PerformanceDashboardResponse',
  performanceTablePageSchema: 'PerformanceTablePage',
  performanceRangeTaskSchema: 'PerformanceRangeTaskResponse',
  // Integrations
  integrationConnectionSchema: 'IntegrationConnectionResponse',
  integrationSyncRunSchema: 'IntegrationSyncRunResponse',
  integrationBackfillProgressSchema: 'IntegrationBackfillProgressResponse',
  integrationSyncEnqueueSchema: 'IntegrationSyncEnqueueResponse',
  integrationTestResultSchema: 'IntegrationTestResponse',
  integrationPropertySchema: 'IntegrationPropertyResponse',
  integrationPropertyMappingSchema: 'IntegrationPropertyMappingResponse',
  // Demand Intelligence
  demandSignalSchema: 'DemandSignalView',
  demandSnapshotSchema: 'DemandSnapshotView',
  demandRecomputeResponseSchema: 'DemandRecomputeResponse',
  // Search Intelligence
  searchTargetSchema: 'TargetResponse',
  searchPreferencesSchema: 'SearchIntelligencePreferences',
  searchRunSchema: 'RunResponse',
  searchDatasetSchema: 'SearchDatasetResponse',
  searchReadinessSchema: 'ReadinessResponse',
  searchRowSchema: 'SearchRowResponse',
  searchDatasetPageSchema: 'DatasetPageResponse',
  // Billing (v8 commercial surface)
  billingCatalogSchema: 'BillingCatalogResponse',
  billingEntitlementSchema: 'BillingEntitlementResponse',
  billingUsageSchema: 'BillingUsageResponse',
  activationSchema: 'ActivationResponse',
  subscriptionCheckoutSchema: 'CheckoutResponse',
  subscriptionChangeSchema: 'SubscriptionChangeResponse',
  resolvedQuoteSchema: 'ResolvedQuoteResponse',
  moneySchema: 'MoneyResponse',
  catalogPlanSchema: 'CatalogPlanResponse',
  catalogAddonSchema: 'CatalogAddonResponse',
  catalogTopupSchema: 'CatalogTopupResponse',
  catalogProviderSchema: 'CatalogProviderResponse',
  capabilityValueSchema: 'CapabilityValueResponse',
  grantProvenanceSchema: 'GrantProvenanceResponse',
  resolvedCapabilitySchema: 'ResolvedCapabilityResponse',
  subscriptionSummarySchema: 'SubscriptionSummaryResponse',
  usageItemSchema: 'UsageItemResponse',
  usageGrantBalanceSchema: 'UsageGrantBalanceResponse',
  // Authenticated provider projection (distinct from the public catalog)
  providerConnectionStatesSchema: 'ProviderConnectionStatesResponse',
  providerConnectionStateEntrySchema: 'ProviderConnectionStateResponse',
  providerProbeSchema: 'ProviderProbeResponse',
  // Opportunities
  opportunitySchema: 'OpportunityItem',
  opportunityDetailSchema: 'OpportunityDetail',
  opportunitiesPageSchema: 'OpportunitiesPage',
  opportunitySummarySchema: 'OpportunitySummary',
  // Actions (one unit of work per target)
  actionItemSchema: 'ActionItem',
  actionDetailSchema: 'ActionDetail',
  actionsPageSchema: 'ActionsPage',
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
  // Site health
  siteCrawlSchema: 'CrawlResponse',
  siteCrawlListPageSchema: 'CrawlListPage',
  siteHealthDashboardSchema: 'DashboardResponse',
  siteHealthEntitlementSchema: 'SiteHealthEntitlementResponse',
  monitoredUrlsResponseSchema: 'MonitoredUrlsResponse',
  inventoryPageSchema: 'InventoryPage',
  pagesPageSchema: 'PagesPage',
  pageDetailSchema: 'PageDetail',
  siteIssuesPageSchema: 'SiteIssuesPage',
  siteIssueDetailSchema: 'SiteIssueDetail',
  issueHistoryPageSchema: 'IssueHistoryPage',
  rerunPageResponseSchema: 'RerunPageResponse',
} as const;

export type ContractSchemaName = keyof typeof CONTRACT_SCHEMA_MAP;
