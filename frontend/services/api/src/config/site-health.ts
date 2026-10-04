/** Native Site Health policy. */
import { compareText } from '../text-order.ts';
import architecture from './site-health/architecture.json' with { type: 'json' };
import acquisition from './site-health/acquisition.json' with { type: 'json' };
import analysis from './site-health/analysis.json' with { type: 'json' };
import reads from './site-health/reads.json' with { type: 'json' };
import links from './site-health/link-metrics.json' with { type: 'json' };
import settings from './site-health/settings.json' with { type: 'json' };
import rules from './site-health/rules.json' with { type: 'json' };
import { changeIntel } from './site-health/change-intel.ts';
import { siteAuthorship } from './site-authorship.ts';
import { companyIdentity } from './company-identity.ts';
import { validateSiteHealthCatalog } from './site-health/validation.ts';

const contentChecks = new Set(Object.keys(reads.reads.content_addressable_check_fields));
const ruleVersion = 'sh-rules-1';

/** Mutation-time allowance projection shares the acquisition owner's bounds. */
export const siteHealthRuntime = {
  settings: {
    automatic_page_limit: settings.automatic_page_limit,
    max_requested_page_limit: settings.max_requested_page_limit,
    max_attempts: settings.max_attempts,
    sample_discovery_url_cap: settings.sample_discovery_url_cap,
    sample_url_limit: settings.sample_url_limit,
  },
  full_headroom: 5,
  full_minimum: 100,
  full_mode: 'full',
  sample_mode: 'sample',
};

function remediationRoute(rule: (typeof rules)[number]) {
  if (contentChecks.has(rule.rule_id)) return 'content';
  if (
    rule.dimension === 'aeo' &&
    ['content', 'citability'].includes(rule.category) &&
    rule.scope === 'page' &&
    rule.rule_id !== 'aeo.server_rendered_content'
  )
    return 'agent';
  return 'code';
}

export const siteHealth = {
  ...architecture,
  ...links,
  ...acquisition,
  versions: {
    extractor: 'sh-extractor-2',
    analyzer: 'sh-analyzer-1',
    rules: ruleVersion,
    architecture: architecture.architecture.formula_version,
    archetype: architecture.archetypes.policy_version,
  },
  settings: { ...settings },
  reads: {
    ...reads.reads,
    content_addressable_check_ids: [...contentChecks].sort(compareText),
  },
  crawl: {
    ...acquisition.crawl,
    frontier_statuses: {
      ...acquisition.crawl.frontier_statuses,
    },
  },
  page_analysis: {
    ...analysis.page_analysis,
    classification: {
      ...analysis.page_analysis.classification,
      page_kinds: [...analysis.page_analysis.classification.page_kinds].sort(compareText),
    },
    facts: {
      ...analysis.page_analysis.facts,
      authorship: siteAuthorship,
      provider_identity_exclusions: companyIdentity.provider_identity_exclusions,
    },
    traits: {
      ...analysis.page_analysis.traits,
      company_profile: companyIdentity.company_profile,
    },
  },
  change_intel: changeIntel,
  rule_catalog: rules.map((rule) => ({
    ...rule,
    rule_version: ruleVersion,
    content_addressable: contentChecks.has(rule.rule_id),
    remediation_route: remediationRoute(rule),
  })),
};

validateSiteHealthCatalog(
  siteHealth.rule_catalog,
  siteHealth.reads.readiness_dimension_weights,
  siteHealth.reads.aeo_check_pillar,
  siteHealth.page_analysis.rules.web_check_ids,
  siteHealth.reads.content_addressable_check_fields,
);
