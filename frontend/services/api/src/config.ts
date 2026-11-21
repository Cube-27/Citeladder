import ipaddr from 'ipaddr.js';
import { ConfigError } from './config/config-error.ts';
import { APP_DATABASE_ROLE } from './db/database.ts';
import { executionSettings, executionSpecs } from './config/execution.ts';
export { ConfigError } from './config/config-error.ts';
import { brandEvidence } from './config/brand-evidence.ts';
import { abuse } from './config/abuse.ts';
import { errors } from './config/errors.ts';
import agentRuntime from './config/agent-runtime.json' with { type: 'json' };
import modelGateway from './config/model-gateway.json' with { type: 'json' };
import { discovery } from './config/discovery.ts';
import promptLibrary from './config/prompt-library.json' with { type: 'json' };
import { entitlements } from './config/entitlements.ts';
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
import publicApi from './config/public-api.json' with { type: 'json' };
import { billing } from './config/billing.ts';
import { integrations, traffic, analytics, referrals, authOAuth } from './config/connected-data.ts';
import integrationCredentials from './config/integration-credentials.json' with { type: 'json' };
import { siteHealth, siteHealthRuntime } from './config/site-health.ts';
import { crawlers } from './config/crawlers.ts';
import { validateSiteHealthSettings } from './config/site-health/validation.ts';
import { commerce, commerceShelf } from './config/commerce.ts';
import { auditSchedules } from './config/audit-schedules.ts';
import { crawlSchedules } from './config/crawl-schedules.ts';
import { industryLibrary } from './config/industry-library.ts';
import { opportunities, opportunityDefaults } from './config/opportunity.ts';
import { earnedActions } from './config/earned-actions.ts';
import { actions } from './config/actions.ts';
import { sourcePatterns } from './config/source-patterns.ts';
import { sourcePages, sourcePageVocabulary, urlIdentity } from './config/source-pages.ts';
import { jev, quality, qualityGatesReported, validateJevSettings } from './config/jev.ts';
import { contentDifferentiation } from './config/content-differentiation.ts';
import { contentOptimization } from './config/content-optimization.ts';
import { contentRules } from './config/content-rules.ts';
import { agentContext } from './config/agent-context.ts';
import { projectReads } from './config/projects.ts';
import { agentSkills } from './config/agent-skills.ts';
import { mcp } from './config/mcp.ts';
import { promptGeneration } from './config/prompt-generation.ts';
import { brandLogos } from './config/brand-logos.ts';
import { internalLinks } from './config/internal-links.ts';
import { perception } from './config/perception.ts';
import { probes } from './config/probes.ts';
import { turnstile } from './config/turnstile.ts';
import {
  billingSettings,
  razorpaySettings,
  type BillingSettings,
  type RazorpaySettings,
} from './billing/config.ts';
import { parseTrustedProxies, type TrustedProxies } from './auth/client-identity.ts';
import { loadWorkerSettings } from './config/analytics.ts';
import {
  resolveSpec,
  Settings,
  type Env,
  type SettingSource,
  type SettingSpec,
} from './config/settings.ts';

export const policy = {
  entitlements,
  development_env_names: api.development_env_names,
  secret_policy: authRuntime.secret_policy,
  crawlers,
  billing,
  task_queue: queue,
  api,
  settings: { ...api.settings, ...integrationCredentials, ...authRuntime.settings },
  integrations,
  dataforseo,
  costs,
  analytics,
  referrals,
  auth: {
    mailbox: authRuntime.mailbox,
    password: authRuntime.password,
    session: authRuntime.session,
    terms_revision: authRuntime.terms_revision,
    privacy_revision: authRuntime.privacy_revision,
    oauth: authOAuth,
    turnstile,
  },
  search_intelligence: {
    ...searchIntelligence,
    task_kind: 'search_intelligence_acquisition',
  },
  demand: {
    ...demand,
    query_page_dataset: traffic.DATASET_GSC_QUERY_PAGE_DAILY,
  },
  visibility: { ...visibility, ...promptLibrary.cohorts },
  projects: projectReads,
  errors,
  agent: { ...agentRuntime },
  abuse,
  audit_schedules: {
    ...auditSchedules,
    selectable_engines: selectableEngines,
    min_interval_minutes: auditSchedules.settings.min_interval_minutes,
  },
  crawl_schedules: crawlSchedules,
  discovery: { ...discovery, industry_library: industryLibrary },
  source_pages: sourcePages,
  audits: { ...audits, url_identity: urlIdentity, commerce_shelf: commerceShelf },
  commerce: {
    ...commerce,
  },
  opportunity: {
    ...opportunityDefaults,
    opportunities: { ...opportunities },
    actions: { ...actions },
    earned_actions: earnedActions,
    source_patterns: { ...sourcePatterns },
    source_pages: { ...sourcePageVocabulary },
    tracking_query_params: siteHealth.tracking_params,
    refresh: { ...opportunityDefaults.refresh },
  },
  models: { ...modelGateway, jev, quality },
  workspaces: workspaceRuntime,
  public_api: publicApi,
  providers,
  content_differentiation: {
    ...contentDifferentiation,
    stop_words: demand.stop_words,
  },
  content_optimization: contentOptimization,
  content_rules: contentRules,
  site_health: siteHealth,
  site_health_runtime: siteHealthRuntime,
  web_fetch: siteHealth.web_fetch,
  traffic,
  agent_context: agentContext,
  agent_skills: agentSkills,
  mcp,
  prompts: {
    ...promptLibrary.prompts,
    generation: promptGeneration,
    candidate: {
      ...promptLibrary.prompts.candidate,
      quality_gates_reported: qualityGatesReported,
    },
  },
  brand_identity: brandIdentity,
  brand_evidence: brandEvidence,
  brand_logos: brandLogos,
  internal_links: internalLinks,
  perception,
  probes,
};

const listenSpecs = {
  host: { env: ['HOST'], type: 'str', default: '' },
  port: { env: ['PORT'], type: 'str', default: '' },
} satisfies Record<string, SettingSpec>;

function isSettingSpec(value: object): value is SettingSpec {
  return (
    'env' in value &&
    Array.isArray(value.env) &&
    'type' in value &&
    typeof value.type === 'string' &&
    'default' in value
  );
}

function settingCatalog(): [string, SettingSpec][] {
  const catalog: [string, SettingSpec][] = [];
  const seen = new Set<object>();
  const visit = (name: string, value: unknown) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (isSettingSpec(value)) catalog.push([name, value]);
    else if (!Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map))
      for (const [key, child] of Object.entries(value)) visit(key, child);
  };
  visit('policy', { policy, executionSpecs, listenSpecs });
  return catalog;
}
const catalog = settingCatalog();

function resolveSettings(env: Env): Settings {
  return new Settings(catalog, env);
}

export function databaseSettings(source: SettingSource) {
  const setting = (name: keyof typeof policy.settings) => resolveSetting(name, source);
  return {
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
  };
}

/**
 * Bounds on each migration statement: a lock wait that would queue the serving
 * revision's queries behind DDL fails fast, and no statement outlasts the job.
 */
export function migrationTimeouts(source: SettingSource) {
  return {
    lockTimeoutMs: resolveSetting('migration_lock_timeout_ms', source) as number,
    statementTimeoutMs: resolveSetting('migration_statement_timeout_ms', source) as number,
  };
}

function resolveSetting(name: keyof typeof policy.settings, source: SettingSource): unknown {
  return resolveSpec(name, policy.settings[name], source);
}

type AppEnv = 'development' | 'test' | 'production';

export type ServiceConfig = {
  settings: Settings;
  execution: ReturnType<typeof executionSettings>;
  billing: BillingSettings;
  razorpay: RazorpaySettings;
  appName: string;
  appEnv: AppEnv;
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
    mailKey: string;
    mailTimeoutMs: number;
    signupReservedDomains: readonly string[];
    frontendUrl: string;
    publicApiUrl: string;
    publicWebsiteUrl: string;
    apiKeyPepper: string;
    trustedProxies: TrustedProxies;
    oauthSettings: Record<string, string | number | boolean>;
    limits: Record<keyof typeof policy.abuse, number>;
    /**
     * Turnstile siteverify secret for sign-up and email-link requests. Empty
     * outside development means unconfigured, and those requests fail closed;
     * Cloudflare's test secrets are honoured only where `testKeysAllowed`.
     */
    turnstile: { secret: string; testKeysAllowed: boolean };
    fetch?: typeof fetch;
  };
  demo: { enabled: boolean; expiresAt: Date | null };
  readinessTimeoutMs: number;
};

const MAX_TCP_PORT = 65_535;

function parsePort(raw: string): number {
  if (raw.trim() === '') return policy.api.service_port;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    throw new ConfigError('PORT must be a TCP port number');
  }
  return port;
}

function isDevelopmentEnv(appEnv: AppEnv): boolean {
  return policy.development_env_names.includes(appEnv);
}

/**
 * The startup environment, or a refusal (AR-1): an unset APP_ENV must not fall
 * back to development, which would switch off every production assertion. The
 * setting itself already refuses an unknown or misspelled name.
 */
function appEnvironment(settings: Settings): AppEnv {
  const appEnv = resolveSetting('app_env', settings);
  if (appEnv === 'development' || appEnv === 'test' || appEnv === 'production') return appEnv;
  throw new ConfigError(
    `APP_ENV must be set to one of ${policy.settings.app_env.values.join(', ')}`,
  );
}

function turnstileSettings(configured: string, appEnv: AppEnv): ServiceConfig['auth']['turnstile'] {
  const development = isDevelopmentEnv(appEnv);
  return {
    secret: configured || (development ? turnstile.development_secret : ''),
    testKeysAllowed: development,
  };
}

/** A Cloudflare test secret would accept the public dummy token: never outside development. */
function turnstileProblems(config: ServiceConfig): string[] {
  const { secret, testKeysAllowed } = config.auth.turnstile;
  return !testKeysAllowed && turnstile.test_secrets.has(secret)
    ? ['TURNSTILE_SECRET_KEY must not be a Cloudflare test secret in production']
    : [];
}

const placeholderPatterns = policy.secret_policy.placeholder_patterns.map(
  (pattern) => new RegExp(pattern, 'iu'),
);

function secretIsPlaceholder(value: string): boolean {
  return placeholderPatterns.some((pattern) => pattern.test(value.trim()));
}

export function secretIsWeak(value: string): boolean {
  const rules = policy.secret_policy;
  return (
    new TextEncoder().encode(value).length < rules.min_bytes ||
    new Set(value).size < rules.min_unique_chars ||
    secretIsPlaceholder(value) ||
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

function productionSecretProblems(config: ServiceConfig): string[] {
  const secrets = {
    JWT_SECRET_KEY: config.session.secretKey,
    ENCRYPTION_KEY: String(resolveSetting('encryption_key', config.settings)),
    REFERRAL_HASH_SALT: String(resolveSetting('referral_hash_salt', config.settings)),
    API_KEY_PEPPER: config.auth.apiKeyPepper,
  };
  const values = Object.values(secrets);
  const issues = Object.entries(secrets)
    .filter(([, value]) => secretIsWeak(value))
    .map(([name]) => `${name} does not meet the production strength policy`);
  if (new Set(values).size !== values.length)
    issues.push('application secrets must be independent');
  const originTokens = {
    CITELADDER_ORIGIN_TOKEN: config.execution.originToken,
    CITELADDER_ORIGIN_TOKEN_PREVIOUS: config.execution.previousOriginToken,
  };
  for (const [name, value] of Object.entries(originTokens))
    if (secretIsPlaceholder(value)) issues.push(`${name} must not be a template placeholder`);
  let password = '';
  let role = '';
  try {
    const url = new URL(config.databaseUrl);
    password = decodeURIComponent(url.password);
    role = decodeURIComponent(url.username);
  } catch {
    /* Report without the URL. */
  }
  if (role !== APP_DATABASE_ROLE)
    issues.push(
      `database_url must connect as the ${APP_DATABASE_ROLE} role, never the schema owner`,
    );
  if (secretIsWeak(password))
    issues.push('database password does not meet the production strength policy');
  if (values.includes(password))
    issues.push('database password must be independent of application secrets');
  const login = String(resolveSetting('dev_login_password', config.settings));
  if (!config.demo.enabled)
    return login
      ? [...issues, 'DEV_LOGIN_PASSWORD must be unset outside development and demo mode']
      : issues;
  const rules = policy.secret_policy.login_password;
  const length = [...login].length;
  if (
    length < rules.min_chars ||
    length > rules.max_chars ||
    new Set(login).size < rules.min_unique_chars ||
    secretIsPlaceholder(login) ||
    rules.weak_words.includes(login.trim().toLowerCase())
  )
    issues.push('dev_login_password does not meet the login password policy');
  if (values.includes(login))
    issues.push('dev_login_password must be independent of application secrets');
  return issues;
}

export function assertDeployable(config: ServiceConfig, force = false): void {
  if (isDevelopmentEnv(config.appEnv) && !force) return;
  const issues = productionSecretProblems(config);
  if (config.auth.publicSignup && !config.auth.mailKey)
    issues.push('RESEND_API_KEY is required for public signup');
  issues.push(...turnstileProblems(config));
  if (
    config.auth.oauthSettings.google_enabled === true &&
    (!config.auth.oauthSettings.google_client_id ||
      !config.auth.oauthSettings.google_client_secret ||
      !config.auth.oauthSettings.google_redirect_uri)
  )
    issues.push(
      'Enabled Google sign-in requires explicit client ID, client secret and redirect URI',
    );
  if (config.database.sslMode !== 'require') {
    issues.push('db_ssl_mode must be require in production');
  }
  if (
    !config.auth.trustedProxies.length ||
    config.auth.trustedProxies.some(([, prefix]) => prefix === 0)
  )
    issues.push('trusted_proxy_cidrs must contain configured networks without catch-all ranges');
  if (config.settings.of(policy.audits.dev_test_allow_platform))
    issues.push(
      'dev_test_login_allow_platform_credentials must be disabled outside development/test',
    );
  if (
    config.demo.enabled &&
    (config.demo.expiresAt === null || !Number.isFinite(config.demo.expiresAt.getTime()))
  )
    issues.push('demo_expires_at must be a timezone-aware timestamp in demo mode');
  if (!isDevelopmentEnv(config.appEnv) && !productionFrontendUrl(config.auth.frontendUrl))
    issues.push('frontend_url must be a non-loopback credential-free HTTPS origin in production');
  if (issues.length) throw new ConfigError(issues.join('; '));
}

export function loadConfig(env: Env = process.env): ServiceConfig {
  const settings = resolveSettings(env);
  const appEnv = appEnvironment(settings);
  const values = <K extends string>(specs: Record<K, SettingSpec>) =>
    Object.fromEntries(
      Object.entries<SettingSpec>(specs).map(([name, spec]) => [name, settings.of(spec)]),
    ) as Record<K, unknown>;
  validateSiteHealthSettings(values(siteHealth.settings));
  validateJevSettings(values(jev));
  loadWorkerSettings(settings);
  const setting = (name: keyof typeof policy.settings) => resolveSetting(name, settings);
  const config: ServiceConfig = {
    settings,
    execution: executionSettings(settings),
    billing: billingSettings(settings),
    razorpay: razorpaySettings(settings),
    appName: setting('app_name') as string,
    appEnv,
    // Every interface by default, as a bridged container needs; a host-network
    // local deployment pins loopback.
    host: String(settings.of(listenSpecs.host)).trim() || '0.0.0.0',
    port: parsePort(String(settings.of(listenSpecs.port))),
    databaseUrl: setting('database_url') as string,
    database: databaseSettings(settings),
    requestIdHeader: setting('request_id_header') as string,
    session: {
      secretKey: setting('jwt_secret_key') as string,
      algorithm: setting('jwt_algorithm') as 'HS256',
      cookieName: setting('session_cookie_name') as string,
      expireSeconds: (setting('jwt_expire_hours') as number) * 3600,
    },
    auth: {
      publicSignup: setting('public_signup_enabled') as boolean,
      mailKey: setting('resend_api_key') as string,
      mailTimeoutMs: setting('auth_mail_timeout_ms') as number,
      signupReservedDomains: policy.auth.mailbox.reserved_domains,
      frontendUrl: setting('frontend_url') as string,
      publicApiUrl: setting('public_api_url') as string,
      publicWebsiteUrl: setting('public_website_url') as string,
      apiKeyPepper: setting('api_key_pepper') as string,
      trustedProxies: parseTrustedProxies(setting('trusted_proxy_cidrs') as string),
      oauthSettings: values(policy.auth.oauth.settings) as Record<
        string,
        string | number | boolean
      >,
      limits: values(policy.abuse) as ServiceConfig['auth']['limits'],
      turnstile: turnstileSettings(setting('turnstile_secret_key') as string, appEnv),
    },
    demo: {
      enabled: setting('demo_mode') as boolean,
      expiresAt: setting('demo_expires_at') as Date | null,
    },
    readinessTimeoutMs: policy.api.readiness_timeout_seconds * 1000,
  };
  assertDeployable(config);
  return config;
}

export function demoAccessExpired(config: ServiceConfig, now: Date = new Date()): boolean {
  if (!config.demo.enabled) return false;
  const expiresAt = config.demo.expiresAt;
  if (expiresAt === null || Number.isNaN(expiresAt.getTime())) return true;
  return now.getTime() >= expiresAt.getTime();
}
