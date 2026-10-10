/**
 * Coded excerpts of the CiteLadder product, drawn for the public site.
 *
 * Every record here is synthetic (`.example` domains, invented brands) and
 * every surface that shows one says so in its caption. The views reproduce
 * the product's layout and vocabulary; they import no application runtime and
 * hold no state, so server-rendered pages can show them without an island.
 */

export {
  AppShellFrame,
  ProductShot,
  type AppShellChrome,
  type ShellFilters,
} from './product-view-parts';
export {
  AnswerView,
  CitedUrlView,
  CommerceView,
  PromptsView,
  ReferralView,
  ShelfSetupView,
  SourcesView,
} from './views-measure';
export { VisibilityView } from './views-visibility';
export {
  AcquisitionView,
  DemandView,
  IntegrationsView,
  PageEvidenceView,
  PageReportView,
  PropertyMappingView,
  QueryPageView,
  SearchView,
  SiteHealthView,
} from './views-diagnose';
export { AdsView, EnginesView, PerceptionView } from './views-signals';
export { CrawlerView, EarnedSourceView, PillarsView } from './views-evidence';
export {
  ActionsView,
  AgentView,
  McpToolsView,
  McpView,
  RevisionsView,
  SkillsView,
} from './views-act';
