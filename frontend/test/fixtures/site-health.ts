import type { WorkspaceEntitlement } from '@/lib/api/billing';
import type { PageSummary, SiteCrawl, SiteHealthEntitlement } from '@citeladder/contracts';

export const SITE_HEALTH_UUID = '11111111-1111-4111-8111-111111111111';
export const SITE_HEALTH_UUID_2 = '22222222-2222-4222-8222-222222222222';
const SITE_HEALTH_WORKSPACE = '33333333-3333-4333-8333-333333333333';
const SITE_HEALTH_PROFILE = '55555555-5555-4555-8555-555555555555';

export type SiteFactsFixture = {
  robots: Record<string, unknown>;
  llms_txt: Record<string, unknown>;
  sitemap: Record<string, unknown>;
};

export function makeSiteFacts(overrides: Partial<SiteFactsFixture> = {}): SiteFactsFixture {
  return {
    robots: {
      observed_at: '2026-10-03T00:00:00Z',
      fetched: true,
      status: 'fetched',
      url: 'https://acme.com/robots.txt',
      status_code: 200,
      catalog_version: '1',
      robots_snapshot_id: SITE_HEALTH_UUID_2,
      bots: [
        {
          bot_id: 'openai_gptbot',
          label: 'GPTBot',
          operator: 'openai',
          purpose: 'ai_training',
          matched: 'specific_group',
          root_access: 'disallowed',
          policy: 'all_disallowed',
          evaluated_url_count: 4,
          disallowed_url_count: 4,
        },
        {
          bot_id: 'anthropic_claudebot',
          label: 'ClaudeBot',
          operator: 'anthropic',
          purpose: 'ai_training',
          matched: 'wildcard_group',
          root_access: 'allowed',
          policy: 'all_allowed',
          evaluated_url_count: 4,
          disallowed_url_count: 0,
        },
        {
          bot_id: 'perplexity_bot',
          label: 'PerplexityBot',
          operator: 'perplexity',
          purpose: 'ai_search',
          matched: 'no_rules',
          root_access: 'allowed',
          policy: 'restricted',
          evaluated_url_count: 4,
          disallowed_url_count: 1,
        },
        {
          bot_id: 'google_extended',
          label: 'Google-Extended',
          operator: 'google',
          purpose: 'ai_training',
          matched: 'no_rules',
          root_access: 'unknown',
          policy: 'unknown',
          evaluated_url_count: 0,
          disallowed_url_count: 0,
        },
      ],
      sitemaps: ['https://acme.com/sitemap.xml'],
    },
    llms_txt: {
      fetched: true,
      url: 'https://acme.com/llms.txt',
      status_code: 200,
      present: true,
    },
    sitemap: { fetched: false, files: [] },
    ...overrides,
  };
}

export function makeSiteHealthEntitlement(
  overrides: Partial<SiteHealthEntitlement> = {},
): SiteHealthEntitlement {
  return { sample_url_limit: 10, count_disclosure: true, ...overrides };
}

export function makeWorkspaceEntitlement(
  overrides: Partial<WorkspaceEntitlement> = {},
): WorkspaceEntitlement {
  return {
    workspace_id: SITE_HEALTH_WORKSPACE,
    status: 'resolved',
    registry_revision: 'reg-1',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    credential_mode: 'byok',
    capabilities: [],
    occupancy: [],
    site_health: makeSiteHealthEntitlement(),
    ...overrides,
  };
}

export function makeSiteCrawl(overrides: Partial<SiteCrawl> = {}): SiteCrawl {
  return {
    id: SITE_HEALTH_UUID_2,
    workspace_id: SITE_HEALTH_WORKSPACE,
    project_id: SITE_HEALTH_UUID,
    profile_id: SITE_HEALTH_PROFILE,
    status: 'completed',
    discovery_status: 'completed',
    analysis_status: 'completed',
    root_url: 'https://acme.com/',
    sample_mode: false,
    robots: { handling: 'respect', decided_by_email: null, decided_at: null },
    inventory_complete: true,
    partial_reason: '',
    visible_url_count: 3,
    analyzed_count: 3,
    failed_count: 0,
    discovery_requested_count: 3,
    analysis_requested_count: 3,
    counters: {
      discovered: 3,
      selected: 3,
      queued: 0,
      running: 0,
      analyzed: 3,
      errors: 0,
      blocked: 0,
      failure_breakdown: {
        robots_denied: 0,
        http_4xx: 0,
        http_5xx: 0,
        timeout: 0,
      },
      activity: {
        state: 'terminal',
        reason: 'terminal',
        queue_depth: 0,
        next_available_at: null,
      },
      by_page_kind: {},
      score_weighting: { kind: 'sample_average' },
    },
    discovered_count: 3,
    total_url_count: 3,
    has_more_site_urls: false,
    score_summary: null,
    failure_summary: null,
    site_facts: makeSiteFacts(),
    extractor_version: 'e1',
    analyzer_version: 'a1',
    rule_version: 'r1',
    scoring_version: 's1',
    error_message: '',
    created_at: '2026-07-16T00:00:00Z',
    updated_at: '2026-07-16T00:00:00Z',
    started_at: '2026-07-16T00:00:00Z',
    completed_at: '2026-07-16T00:05:00Z',
    ...overrides,
  };
}

export function makePageSummary(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    site_url_id: SITE_HEALTH_UUID,
    crawl_id: SITE_HEALTH_UUID_2,
    normalized_url: 'https://acme.com/',
    display_url: 'https://acme.com/',
    title: 'Homepage',
    monitored: true,
    analysis_status: 'completed',
    error_code: '',
    linked_from: [],
    issue_count: 3,
    web_fundamentals_score: 46,
    web_fundamentals_coverage: 1,
    web_fundamentals_state: 'measured',
    aeo_readiness_score: 64,
    aeo_measurement_coverage: 0.8,
    aeo_measurement_state: 'measured',
    web_fundamentals_checks: null,
    aeo_readiness_checks: null,
    aeo_measurement_reason: '',
    main_content_indexable: true,
    robots_excluded: false,
    last_audited: '2026-07-16T00:00:00Z',
    page_kind: 'article',
    inbound_count: 12,
    main_content_inbound_count: 4,
    depth_from_home: 1,
    ...overrides,
  };
}
