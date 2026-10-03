/**
 * Service configuration: native policy, shared Python policy and environment overrides.
 *
 * Migrated policy belongs in `./config/`; policy with remaining Python readers
 * arrives through the drift-checked `generated/python-config.json` export.
 * Each section has one authority. Environment overrides are validated here.
 */
import pythonConfig from './generated/python-config.json' with { type: 'json' };
import ipaddr from 'ipaddr.js';
import { ConfigError } from './config/config-error.ts';
import { executionSettings } from './config/execution.ts';
export { ConfigError } from './config/config-error.ts';
import { brandEvidence } from './config/brand-evidence.ts';
import { abuse } from './config/abuse.ts';
import { errors } from './config/errors.ts';
import { compareText } from './text-order.ts';
import agentRuntime from './config/agent-runtime.json' with { type: 'json' };
import modelGateway from './config/model-gateway.json' with { type: 'json' };
import { discovery } from './config/discovery.ts';
import promptLibrary from './config/prompt-library.json' with { type: 'json' };
import api from './config/api.json' with { type: 'json' };
import searchIntelligence from './config/search-intelligence.json' with { type: 'json' };
import demand from './config/demand.json' with { type: 'json' };
import { audits, visibility, selectableEngines } from './config/audits.ts';
import { providers, dataforseo } from './config/providers.ts';
import costs from './config/costs.json' with { type: 'json' };
import brandIdentity from './config/brand-identity.json' with { type: 'json' };
import workspaceRuntime from './config/workspaces.json' with { type: 'json' };
import authRuntime from './config/auth-runtime.json' with { type: 'json' };
import queue from './config/queue.json' with { type: 'json' };
import { billing } from './config/billing.ts';
import { integrations, traffic, analytics, referrals, authOAuth } from './config/connected-data.ts';
import integrationCredentials from './config/integration-credentials.json' with { type: 'json' };
import { siteHealth } from './config/site-health.ts';
import { validateSiteHealthSettings } from './config/site-health/validation.ts';
import { commerce, commerceShelf } from './config/commerce.ts';
import { auditSchedules } from './config/audit-schedules.ts';
import { industryLibrary } from './config/industry-library.ts';
import { opportunities, opportunityDeclaration } from './config/opportunity.ts';
import { earnedActions } from './config/earned-actions.ts';
import { actions } from './config/actions.ts';
import { placement } from './config/placement.ts';
import { sourcePatterns } from './config/source-patterns.ts';
import { sourcePages, sourcePageVocabulary, urlIdentity } from './config/source-pages.ts';
import { jev, quality, qualityGatesReported, validateJevSettings } from './config/jev.ts';
import { appModels } from './config/app-models.ts';
import { productTourVersion } from './config/product-tour.ts';
import { contentDifferentiation } from './config/content-differentiation.ts';
import { agentContext } from './config/agent-context.ts';
import { projectReads } from './config/projects.ts';
import { agentSkills } from './config/agent-skills.ts';
import { mcp } from './config/mcp.ts';
import { promptGeneration } from './config/prompt-generation.ts';
import { brandLogos } from './config/brand-logos.ts';
import { internalLinks } from './config/internal-links.ts';
import {
  billingSettings,
  razorpaySettings,
  type BillingSettings,
  type RazorpaySettings,
} from './billing/config.ts';
import { epochMicros, parseDatetime } from './http/datetimes.ts';
import { parseTrustedProxies, type TrustedProxies } from './auth/client-identity.ts';

type SettingSpec = {
  env: string[];
  type: string;
  default: unknown;
  values?: unknown[];
  minimum?: number;
  exclusive_minimum?: number;
  maximum?: number;
  exclusive_maximum?: number;
};

export const policy = {
  ...pythonConfig,
  billing,
  task_queue: { ...pythonConfig.task_queue, ...queue },
  api,
  settings: { ...pythonConfig.settings, ...integrationCredentials, ...authRuntime.settings },
  integrations,
  dataforseo,
  costs,
  analytics,
  referrals,
  auth: {
    ...pythonConfig.auth,
    terms_revision: authRuntime.terms_revision,
    privacy_revision: authRuntime.privacy_revision,
    oauth: authOAuth,
  },
  search_intelligence: {
    ...searchIntelligence,
    ...pythonConfig.search_intelligence,
    task_kind: analytics.tasks.search_intelligence_acquisition,
    connection_test_ok: providers.test_status_ok,
  },
  demand: {
    ...demand,
    ...pythonConfig.demand,
    query_page_dataset: traffic.DATASET_GSC_QUERY_PAGE_DAILY,
  },
  visibility: { ...visibility, ...promptLibrary.cohorts },
  projects: {
    ...pythonConfig.projects,
    ...projectReads,
    prompt_set_name: promptLibrary.prompt_set_name,
    min_repetitions: audits.min_repetitions,
    max_repetitions: audits.max_repetitions,
    location_codes: dataforseo.constants.location_codes,
    language_codes: dataforseo.constants.language_codes,
  },
  errors,
  agent: { ...agentRuntime, ...pythonConfig.agent },
  abuse,
  audit_schedules: {
    ...pythonConfig.audit_schedules,
    ...auditSchedules,
    selectable_engines: selectableEngines,
    min_interval_minutes: auditSchedules.settings.min_interval_minutes,
  },
  discovery: { ...discovery, industry_library: industryLibrary },
  source_pages: sourcePages,
  audits: { ...audits, url_identity: urlIdentity, commerce_shelf: commerceShelf },
  commerce: {
    ...commerce,
    ...pythonConfig.commerce,
    discovery: { ...commerce.discovery, ...pythonConfig.commerce.discovery },
    buyer_prompts: { ...commerce.buyer_prompts, ...pythonConfig.commerce.buyer_prompts },
  },
  opportunity: {
    ...pythonConfig.opportunity,
    measurement_policy_key: audits.constants.measurement_policy_key,
    declaration: opportunityDeclaration,
    opportunities: { ...opportunities, ...pythonConfig.opportunity.opportunities },
    actions: { ...actions, ...pythonConfig.opportunity.actions },
    earned_actions: earnedActions,
    placement: { ...placement, ...pythonConfig.opportunity.placement },
    source_patterns: { ...sourcePatterns, ...pythonConfig.opportunity.source_patterns },
    source_pages: { ...sourcePageVocabulary, ...pythonConfig.opportunity.source_pages },
    tracking_query_params: siteHealth.tracking_params,
    refresh: {
      ...pythonConfig.opportunity.refresh,
      finding_class_defect: 'defect',
      change_analyzer_version: siteHealth.change_intel.analyzer_version,
      change_class_regression: siteHealth.change_intel.class_regression,
      change_class_critical: siteHealth.change_intel.class_critical,
      change_max_observations: siteHealth.change_intel.max_observations,
      change_state_available: siteHealth.change_intel.state_available,
      content_change_field: siteHealth.change_intel.change_field,
      source_page_outcome_inspected: sourcePageVocabulary.INSPECTION_INSPECTED,
    },
  },
  models: { ...modelGateway, jev, quality },
  workspaces: { ...pythonConfig.workspaces, ...workspaceRuntime, tour_version: productTourVersion },
  providers: { ...providers, app: appModels },
  content_differentiation: {
    ...contentDifferentiation,
    stop_words: demand.stop_words,
  },
  site_health: siteHealth,
  web_fetch: siteHealth.web_fetch,
  traffic: {
    ...traffic,
    url_schemes: siteHealth.web_fetch.schemes,
    url_ports: siteHealth.web_fetch.ports,
    ignored_query_keys: [...siteHealth.tracking_params, ...siteHealth.ignored_query_keys].sort(
      compareText,
    ),
  },
  agent_context: agentContext,
  agent_skills: agentSkills,
  mcp: {
    ...mcp,
    terms_revision: authRuntime.terms_revision,
    constants: {
      ...mcp.constants,
      api_request_body_max_bytes: api.request_body_max_bytes,
    },
  },
  prompts: {
    ...promptLibrary.prompts,
    ...pythonConfig.prompts,
    origins: { ...promptLibrary.prompts.origins, ...pythonConfig.prompts.origins },
    generation: promptGeneration,
    candidate: {
      ...promptLibrary.prompts.candidate,
      ...pythonConfig.prompts.candidate,
      quality_gates_reported: qualityGatesReported,
    },
  },
  brand_identity: {
    ...brandIdentity,
    ...pythonConfig.brand_identity,
    suggestion_pending: audits.observed_competitors.status_pending,
    suggestion_accepted: audits.observed_competitors.status_accepted,
  },
  brand_evidence: brandEvidence,
  brand_logos: brandLogos,
  internal_links: internalLinks,
};

const TRUE_VALUES = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE_VALUES = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

function envValue(spec: SettingSpec, env: Record<string, string | undefined>): string | undefined {
  // pydantic-settings matches environment names case-insensitively.
  const byLowerName = new Map(
    Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]),
  );
  for (const name of spec.env) {
    const value = byLowerName.get(name.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function checkBounds(name: string, value: number, spec: SettingSpec): number {
  if (spec.exclusive_minimum !== undefined && value <= spec.exclusive_minimum) {
    throw new ConfigError(`${name} must be > ${spec.exclusive_minimum}`);
  }
  if (spec.minimum !== undefined && value < spec.minimum) {
    throw new ConfigError(`${name} must be >= ${spec.minimum}`);
  }
  if (spec.maximum !== undefined && value > spec.maximum) {
    throw new ConfigError(`${name} must be <= ${spec.maximum}`);
  }
  if (spec.exclusive_maximum !== undefined && value >= spec.exclusive_maximum) {
    throw new ConfigError(`${name} must be < ${spec.exclusive_maximum}`);
  }
  return value;
}

function parseInteger(name: string, raw: string, spec: SettingSpec): number {
  if (!/^[+-]?\d+$/u.test(raw.trim())) throw new ConfigError(`${name} must be an integer`);
  return checkBounds(name, Number(raw.trim()), spec);
}

function parseFloatSetting(name: string, raw: string, spec: SettingSpec): number {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value)) throw new ConfigError(`${name} must be a number`);
  return checkBounds(name, value, spec);
}

function parseBoolean(name: string, raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new ConfigError(`${name} must be a boolean`);
}

function parseDatetimeSetting(name: string, raw: string): Date | null {
  if (!raw.trim()) return null;
  // A calendar-invalid or free-form value is refused, as Python refuses it.
  const parsed = parseDatetime(raw.trim());
  if (parsed === null) throw new ConfigError(`${name} must be a timestamp`);
  // A naive timestamp is kept as "present but unusable"; demo access then
  // fails closed exactly as `demo_access_expired` does for a naive value.
  if (parsed.offsetSeconds === null) return new Date(Number.NaN);
  return new Date(Number(epochMicros(parsed) / 1000n));
}

function parseSetting(name: string, spec: SettingSpec, raw: string): unknown {
  switch (spec.type) {
    case 'int':
      return parseInteger(name, raw, spec);
    case 'float':
      return parseFloatSetting(name, raw, spec);
    case 'bool':
      return parseBoolean(name, raw);
    case 'datetime':
      return parseDatetimeSetting(name, raw);
    case 'literal':
      if (!spec.values?.includes(raw)) {
        throw new ConfigError(`${name} must be one of ${spec.values?.join(', ')}`);
      }
      return raw;
    default:
      return raw;
  }
}

function resolveSpec(
  name: string,
  spec: SettingSpec,
  env: Record<string, string | undefined>,
): unknown {
  const raw = envValue(spec, env);
  return raw === undefined ? spec.default : parseSetting(name, spec, raw);
}

function resolveSetting(name: string, env: Record<string, string | undefined>): unknown {
  return resolveSpec(name, policy.settings[name as keyof typeof policy.settings], env);
}

export type ServiceConfig = {
  execution: ReturnType<typeof executionSettings>;
  billing: BillingSettings;
  razorpay: RazorpaySettings;
  appName: string;
  appEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  database: {
    poolSize: number;
    maxOverflow: number;
    poolRecycleSeconds: number;
    poolTimeoutSeconds: number;
    connectTimeoutSeconds: number;
    commandTimeoutSeconds: number;
    statementTimeoutMs: number;
    lockTimeoutMs: number;
    idleTransactionTimeoutMs: number;
    sslMode: 'disable' | 'require';
  };
  requestIdHeader: string;
  session: {
    secretKey: string;
    algorithm: 'HS256';
    cookieName: string;
    expireSeconds: number;
  };
  auth: {
    publicSignup: boolean;
    frontendUrl: string;
    trustedProxies: TrustedProxies;
    oauthSettings: Record<string, string | number | boolean>;
    limits: Record<keyof typeof policy.abuse, number>;
    /** Injected provider transport for recorded-fixture tests. */
    fetch?: typeof fetch;
  };
  demo: { enabled: boolean; expiresAt: Date | null };
  readinessTimeoutMs: number;
};

// The TCP port range is a protocol fact, not policy; the default is exported.
const MAX_TCP_PORT = 65_535;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return policy.api.service_port;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    throw new ConfigError('PORT must be a TCP port number');
  }
  return port;
}

function isDevelopmentEnv(appEnv: string): boolean {
  return policy.development_env_names.includes(appEnv.trim().toLowerCase());
}

/** Mirror of `secret_is_weak` in `backend/app/core/config`, from its exported policy. */
export function secretIsWeak(value: string): boolean {
  const rules = policy.secret_policy;
  return (
    new TextEncoder().encode(value).length < rules.min_bytes ||
    new Set(value).size < rules.min_unique_chars ||
    rules.insecure_values.includes(value) ||
    rules.weak_words.includes(value.trim().toLowerCase())
  );
}

function productionFrontendUrl(value: string): boolean {
  try {
    // Inspect the unnormalized path too: URL would collapse /private/.. to /.
    if (!/^https:\/\/[^/?#\\@]+\/?$/iu.test(value.trim())) return false;
    const url = new URL(value);
    let host = url.hostname;
    if (host.startsWith('[')) host = host.slice(1, -1);
    let end = host.length;
    while (host[end - 1] === '.') end -= 1;
    host = host.slice(0, end);
    return (
      !url.username &&
      !url.password &&
      host.toLowerCase() !== 'localhost' &&
      !(
        ipaddr.isValid(host) &&
        (ipaddr.process(host).toString().startsWith('0.') ||
          ['loopback', 'unspecified', 'linkLocal'].includes(ipaddr.process(host).range()))
      )
    );
  } catch {
    return false;
  }
}

function productionSecretProblems(
  config: ServiceConfig,
  env: Record<string, string | undefined>,
): string[] {
  const secrets = {
    JWT_SECRET_KEY: config.session.secretKey,
    ENCRYPTION_KEY: String(resolveSetting('encryption_key', env)),
    REFERRAL_HASH_SALT: String(resolveSetting('referral_hash_salt', env)),
  };
  const values = Object.values(secrets);
  const issues = Object.entries(secrets)
    .filter(([, value]) => secretIsWeak(value))
    .map(([name]) => `${name} does not meet the production strength policy`);
  if (new Set(values).size !== values.length)
    issues.push('application secrets must be independent');
  let password = '';
  try {
    password = decodeURIComponent(new URL(config.databaseUrl).password);
  } catch {
    /* Report without the URL. */
  }
  if (secretIsWeak(password))
    issues.push('database password does not meet the production strength policy');
  if (values.includes(password))
    issues.push('database password must be independent of application secrets');
  const login = String(resolveSetting('dev_login_password', env));
  const rules = policy.secret_policy.login_password;
  const length = [...login].length;
  if (
    length < rules.min_chars ||
    length > rules.max_chars ||
    new Set(login).size < rules.min_unique_chars ||
    rules.weak_words.includes(login.trim().toLowerCase())
  )
    issues.push('dev_login_password does not meet the login password policy');
  if (values.includes(login))
    issues.push('dev_login_password must be independent of application secrets');
  return issues;
}

function assertDeployable(config: ServiceConfig, env: Record<string, string | undefined>): void {
  if (isDevelopmentEnv(config.appEnv)) return;
  const issues = productionSecretProblems(config, env);
  if (config.database.sslMode !== 'require') {
    issues.push('db_ssl_mode must be require in production');
  }
  if (
    !config.auth.trustedProxies.length ||
    config.auth.trustedProxies.some(([, prefix]) => prefix === 0)
  )
    issues.push('trusted_proxy_cidrs must contain configured networks without catch-all ranges');
  if (resolveSettingSpec(policy.audits.dev_test_allow_platform, env))
    issues.push(
      'dev_test_login_allow_platform_credentials must be disabled outside development/test',
    );
  if (
    config.demo.enabled &&
    (config.demo.expiresAt === null || !Number.isFinite(config.demo.expiresAt.getTime()))
  )
    issues.push('demo_expires_at must be a timezone-aware timestamp in demo mode');
  if (!productionFrontendUrl(config.auth.frontendUrl))
    issues.push('frontend_url must be a non-loopback credential-free HTTPS origin in production');
  if (issues.length) throw new ConfigError(issues.join('; '));
}

// Auxiliary owners resolve the same startup input. Keep it out of loggable
// configuration objects because an environment can contain unrelated secrets.
const environments = new WeakMap<ServiceConfig, Record<string, string | undefined>>();
export function configEnvironment(config: ServiceConfig): Record<string, string | undefined> {
  return environments.get(config) ?? {};
}

/** Resolve the service configuration from `env` (defaults to `process.env`). */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  validateSiteHealthSettings(
    Object.fromEntries(
      Object.entries(siteHealth.settings).map(([name, spec]) => [
        name,
        resolveSettingSpec(spec, env),
      ]),
    ),
  );
  validateJevSettings(
    Object.fromEntries(
      Object.entries(jev).map(([name, spec]) => [name, resolveSettingSpec(spec, env)]),
    ) as Record<keyof typeof jev, unknown>,
  );
  const setting = (name: keyof typeof policy.settings) => resolveSetting(name, env);
  const config: ServiceConfig = {
    execution: executionSettings(env),
    billing: billingSettings(env),
    razorpay: razorpaySettings(env),
    appName: setting('app_name') as string,
    appEnv: setting('app_env') as string,
    // Every interface by default, as a bridged container needs; a host-network
    // deployment pins loopback, as the Python web process does.
    host: env.HOST?.trim() || '0.0.0.0',
    port: parsePort(env.PORT),
    databaseUrl: setting('database_url') as string,
    database: {
      poolSize: setting('db_pool_size') as number,
      maxOverflow: setting('db_max_overflow') as number,
      poolRecycleSeconds: setting('db_pool_recycle_seconds') as number,
      poolTimeoutSeconds: setting('db_pool_timeout_seconds') as number,
      connectTimeoutSeconds: setting('db_connect_timeout_seconds') as number,
      commandTimeoutSeconds: setting('db_command_timeout_seconds') as number,
      statementTimeoutMs: setting('db_statement_timeout_ms') as number,
      lockTimeoutMs: setting('db_lock_timeout_ms') as number,
      idleTransactionTimeoutMs: setting('db_idle_transaction_timeout_ms') as number,
      sslMode: setting('db_ssl_mode') as 'disable' | 'require',
    },
    requestIdHeader: setting('request_id_header') as string,
    session: {
      secretKey: setting('jwt_secret_key') as string,
      algorithm: setting('jwt_algorithm') as 'HS256',
      cookieName: setting('session_cookie_name') as string,
      expireSeconds: (setting('jwt_expire_hours') as number) * 3600,
    },
    auth: {
      publicSignup: setting('public_signup_enabled') as boolean,
      frontendUrl: setting('frontend_url') as string,
      trustedProxies: parseTrustedProxies(setting('trusted_proxy_cidrs') as string),
      oauthSettings: {
        ...Object.fromEntries(
          Object.entries(policy.auth.oauth.settings).map(([name, spec]) => [
            name,
            resolveSettingSpec(spec, env),
          ]),
        ),
        integration_client_id: setting('integration_google_client_id'),
        integration_client_secret: setting('integration_google_client_secret'),
      } as Record<string, string | number | boolean>,
      limits: Object.fromEntries(
        Object.entries(policy.abuse).map(([name, spec]) => [name, resolveSettingSpec(spec, env)]),
      ) as ServiceConfig['auth']['limits'],
    },
    demo: {
      enabled: setting('demo_mode') as boolean,
      expiresAt: setting('demo_expires_at') as Date | null,
    },
    readinessTimeoutMs: policy.api.readiness_timeout_seconds * 1000,
  };
  assertDeployable(config, env);
  environments.set(config, { ...env });
  return config;
}

/** Fail closed when demo mode has no valid future access deadline. */
export function demoAccessExpired(config: ServiceConfig, now: Date = new Date()): boolean {
  if (!config.demo.enabled) return false;
  const expiresAt = config.demo.expiresAt;
  if (expiresAt === null || Number.isNaN(expiresAt.getTime())) return true;
  return now.getTime() >= expiresAt.getTime();
}

export type WorkerSettings = {
  leaseReclaimBatchSize: number;
  drainBudgetSeconds: number;
  leaseTtlSeconds: number;
  heartbeatIntervalSeconds: number;
  taskMaxAttempts: number;
  pollIntervalSeconds: number;
  retryDelaySeconds: number;
};

/** One exported setting after its environment override, as pydantic-settings resolves it. */
export function resolveSettingSpec(
  spec: SettingSpec,
  env: Record<string, string | undefined> = process.env,
): unknown {
  return resolveSpec(spec.env[0] ?? 'setting', spec, env);
}

export function activeJobRetrySeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  return resolveSpec(
    'active_job_retry_after_seconds',
    policy.abuse.active_job_retry_after_seconds,
    env,
  ) as number;
}

/** The analytics worker knobs (`ANALYTICS_*`), refusing a heartbeat slower than the lease. */
export function loadWorkerSettings(
  env: Record<string, string | undefined> = process.env,
): WorkerSettings {
  const specs = policy.analytics.worker_settings;
  const setting = (name: keyof typeof specs) => resolveSpec(name, specs[name], env) as number;
  const settings: WorkerSettings = {
    leaseReclaimBatchSize: setting('lease_reclaim_batch_size'),
    drainBudgetSeconds: setting('drain_budget_seconds'),
    leaseTtlSeconds: setting('lease_ttl_seconds'),
    heartbeatIntervalSeconds: setting('heartbeat_interval_seconds'),
    taskMaxAttempts: setting('task_max_attempts'),
    pollIntervalSeconds: setting('poll_interval_seconds'),
    retryDelaySeconds: setting('retry_delay_seconds'),
  };
  // A heartbeat slower than the lease guarantees expiry during healthy work.
  if (settings.heartbeatIntervalSeconds >= settings.leaseTtlSeconds) {
    throw new ConfigError('heartbeat_interval_seconds must be shorter than lease_ttl_seconds');
  }
  return settings;
}
