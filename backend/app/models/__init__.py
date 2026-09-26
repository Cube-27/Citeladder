# ORM model registry.
#
# Import the shared declarative ``Base`` and re-export it so Alembic's
# ``migrations/env.py`` binds autogeneration to a single metadata object.
# Model modules are imported here so their tables register on
# ``Base.metadata`` before autogenerate / create_all runs.
from __future__ import annotations

from app.core.database import Base
from app.models.abuse import QueueWorkspaceTurn, UsageWindow
from app.models.agent import (
    AgentChat,
    AgentInstructionRevision,
    AgentMessage,
    AgentModelAttempt,
    AgentOutput,
    AgentOutputRevision,
    AgentRun,
    AgentToolAttempt,
)
from app.models.analysis import (
    BrandMention,
    Citation,
    CompetitorMention,
    MetricSnapshot,
    PromptMetricSnapshot,
    ResponseAnalysis,
)
from app.models.analytics import (
    AiReferralsSnapshot,
    AnalyticsTask,
    ReferralClassification,
    ReferralEvent,
)
from app.models.audit import (
    Audit,
    AuditEngineSnapshot,
    AuditEvent,
    AuditPromptSnapshot,
    AuditTask,
    ExecutionCostProjection,
    ProviderAttempt,
    RawResponseArtifact,
)
from app.models.audit_schedule import AuditSchedule
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingCatalogRevision,
    BillingCustomer,
    BillingSubscription,
    BillingWebhookEvent,
    ConsumableLedger,
    GrantRevocation,
    IdempotencyRecord,
    PendingActivation,
)
from app.models.billing_invoice import (
    BillingInvoice as BillingInvoice,
)
from app.models.billing_invoice import (
    BillingInvoiceCounter as BillingInvoiceCounter,
)
from app.models.billing_journeys import IntroductoryClaim, IntroductoryOperatorCode
from app.models.billing_payment import BillingPayment as BillingPayment
from app.models.brand import (
    Brand,
    BrandAlias,
    BrandLogoAsset,
    BrandProfile,
    Competitor,
    ObservedEntityCandidate,
    OwnedDomain,
    UnintendedDomain,
)
from app.models.commerce import (
    CommerceCategory,
    CommerceCompetitorAttempt,
    CommerceCompetitorCandidate,
    CommerceCsvImport,
    CommerceObservationCitation,
    CommerceProduct,
    CommerceProductCategory,
    CommerceProductObservation,
    CommercePromptTarget,
    CommerceRecommendationObservation,
    CommerceShelfSnapshot,
)
from app.models.content_differentiation import (
    ContentDifferentiationCandidate,
    ContentDifferentiationReport,
)
from app.models.demand import (
    BrandedQueryOverride,
    DemandSignal,
    DemandSnapshot,
    QueryEvidenceRow,
    QueryEvidenceSnapshot,
)
from app.models.discovery import BrandDiscovery, BrandResearchSnapshot
from app.models.integrations import (
    IntegrationConnection,
    IntegrationEvent,
    IntegrationImportArtifact,
    IntegrationMetricRow,
    IntegrationOAuthGrant,
    IntegrationOAuthState,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.mcp import (
    McpAuthorizationCode,
    McpAuthorizationRequest,
    McpOAuthClient,
    McpOAuthGrant,
)
from app.models.opportunity import (
    Action,
    ActionStatusEvent,
    Opportunity,
    OpportunityImplementationEvent,
    OpportunityOrder,
    OpportunitySnapshot,
    OpportunityVerificationEvent,
)
from app.models.policy_acceptance import PolicyAcceptance as PolicyAcceptance
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.provider import (
    DiscoveryModelConfig,
    ProviderAppRoute,
    ProviderConnection,
    ProviderConnectionTest,
    ProviderRoute,
)
from app.models.provider_disclosure import ProviderDisclosure as ProviderDisclosure
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDataset,
    SearchIntelligenceDispatchAttempt,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from app.models.search_surfaces import AioEntityLink, AioObservation
from app.models.security_event import SecurityEvent as SecurityEvent
from app.models.site_changes import SiteChangeObservation, SiteChangeSnapshot
from app.models.site_health.acquisition import SiteFetchArtifact, SiteFetchAttempt
from app.models.site_health.analysis import (
    SiteIssue,
    SitePageAnalysis,
    SiteRuleEvaluation,
)
from app.models.site_health.architecture import SiteObservedArchitecture
from app.models.site_health.crawl import (
    SiteCrawl,
    SiteDiscoveryFrontier,
)
from app.models.site_health.events import SiteCrawlEvent
from app.models.site_health.links import SitePageLinkMetric
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.runtime import SiteHealthProfile, WorkspaceSiteHealthRuntime
from app.models.site_health.snapshot import SiteHealthSnapshot
from app.models.site_health.urls import MonitoredSiteUrl, SiteUrl, SiteUrlObservation
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageInspectionSpend,
    SourcePageSnapshot,
)
from app.models.traffic import (
    PerformanceDimensionStat,
    TrafficPageStat,
    TrafficQueryStat,
    TrafficSnapshot,
)
from app.models.user import User
from app.models.user_identity import UserIdentity
from app.models.web_acquisition_control import (
    WebAcquisitionControl as WebAcquisitionControl,
)
from app.models.workspace import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)

__all__ = [
    "AccountGrant",
    "Action",
    "ActionStatusEvent",
    "AgentChat",
    "AgentInstructionRevision",
    "AgentMessage",
    "AgentModelAttempt",
    "AgentOutput",
    "AgentOutputRevision",
    "AgentRun",
    "AgentToolAttempt",
    "AiReferralsSnapshot",
    "AioEntityLink",
    "AioObservation",
    "AnalyticsTask",
    "Audit",
    "AuditEngineSnapshot",
    "AuditEvent",
    "AuditPromptSnapshot",
    "AuditSchedule",
    "AuditTask",
    "Base",
    "BillingAccount",
    "BillingCatalogRevision",
    "BillingCustomer",
    "BillingInvoice",
    "BillingInvoiceCounter",
    "BillingPayment",
    "BillingSubscription",
    "BillingWebhookEvent",
    "Brand",
    "BrandAlias",
    "BrandDiscovery",
    "BrandLogoAsset",
    "BrandMention",
    "BrandProfile",
    "BrandResearchSnapshot",
    "BrandedQueryOverride",
    "Citation",
    "CommerceCategory",
    "CommerceCompetitorAttempt",
    "CommerceCompetitorCandidate",
    "CommerceCsvImport",
    "CommerceObservationCitation",
    "CommerceProduct",
    "CommerceProductCategory",
    "CommerceProductObservation",
    "CommercePromptTarget",
    "CommerceRecommendationObservation",
    "CommerceShelfSnapshot",
    "Competitor",
    "CompetitorMention",
    "ConsumableLedger",
    "ContentDifferentiationCandidate",
    "ContentDifferentiationReport",
    "DemandSignal",
    "DemandSnapshot",
    "DiscoveryModelConfig",
    "ExecutionCostProjection",
    "GrantRevocation",
    "IdempotencyRecord",
    "IntegrationConnection",
    "IntegrationEvent",
    "IntegrationImportArtifact",
    "IntegrationMetricRow",
    "IntegrationOAuthGrant",
    "IntegrationOAuthState",
    "IntegrationPropertyMapping",
    "IntegrationSyncRun",
    "IntroductoryClaim",
    "IntroductoryOperatorCode",
    "McpAuthorizationCode",
    "McpAuthorizationRequest",
    "McpOAuthClient",
    "McpOAuthGrant",
    "MetricSnapshot",
    "MonitoredSiteUrl",
    "ObservedEntityCandidate",
    "Opportunity",
    "OpportunityImplementationEvent",
    "OpportunityOrder",
    "OpportunitySnapshot",
    "OpportunityVerificationEvent",
    "OwnedDomain",
    "PendingActivation",
    "PerformanceDimensionStat",
    "Project",
    "Prompt",
    "PromptMetricSnapshot",
    "PromptSet",
    "ProviderAppRoute",
    "ProviderAttempt",
    "ProviderConnection",
    "ProviderConnectionTest",
    "ProviderRoute",
    "QueryEvidenceRow",
    "QueryEvidenceSnapshot",
    "QueueWorkspaceTurn",
    "RawResponseArtifact",
    "ReferralClassification",
    "ReferralEvent",
    "ResponseAnalysis",
    "SearchIntelligenceCall",
    "SearchIntelligenceDataset",
    "SearchIntelligenceDispatchAttempt",
    "SearchIntelligenceRow",
    "SearchIntelligenceRun",
    "SiteChangeObservation",
    "SiteChangeSnapshot",
    "SiteCrawl",
    "SiteCrawlEvent",
    "SiteCrawlTask",
    "SiteDiscoveryFrontier",
    "SiteFetchArtifact",
    "SiteFetchAttempt",
    "SiteHealthProfile",
    "SiteHealthSnapshot",
    "SiteIssue",
    "SiteObservedArchitecture",
    "SitePageAnalysis",
    "SitePageLinkMetric",
    "SiteRuleEvaluation",
    "SiteUrl",
    "SiteUrlObservation",
    "SourcePage",
    "SourcePageEntityPresence",
    "SourcePageInspectionSpend",
    "SourcePageSnapshot",
    "Topic",
    "TrafficPageStat",
    "TrafficQueryStat",
    "TrafficSnapshot",
    "UnintendedDomain",
    "UsageWindow",
    "User",
    "UserIdentity",
    "Workspace",
    "WorkspaceInvitation",
    "WorkspaceMember",
    "WorkspaceSiteHealthRuntime",
]
