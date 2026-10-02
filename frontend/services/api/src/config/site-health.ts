/** Native Site Health policy, composed with the narrow Python model/operator bridge. */
import shared from '../generated/python-config.json' with { type: 'json' };
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
  settings: { ...settings, ...shared.site_health_runtime.settings },
  reads: {
    ...reads.reads,
    ...shared.site_health.reads,
    content_addressable_check_ids: [...contentChecks].sort(),
  },
  crawl: {
    ...acquisition.crawl,
    frontier_statuses: {
      ...acquisition.crawl.frontier_statuses,
      ...shared.site_health.crawl.frontier_statuses,
    },
  },
  page_analysis: {
    ...analysis.page_analysis,
    classification: {
      ...analysis.page_analysis.classification,
      page_kinds: [
        ...analysis.page_analysis.classification.page_kinds,
        shared.site_health.model_defaults.page_kind_other,
      ].sort(),
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
    remediation_route: contentChecks.has(rule.rule_id)
      ? 'content'
      : rule.dimension === 'aeo' &&
          ['content', 'citability'].includes(rule.category) &&
          rule.scope === 'page' &&
          rule.rule_id !== 'aeo.server_rendered_content'
        ? 'agent'
        : 'code',
  })),
};

validateSiteHealthCatalog(
  siteHealth.rule_catalog,
  siteHealth.reads.readiness_dimension_weights,
  siteHealth.reads.aeo_check_pillar,
  siteHealth.page_analysis.rules.web_check_ids,
  siteHealth.reads.content_addressable_check_fields,
);
