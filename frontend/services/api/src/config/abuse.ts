import authRuntime from './auth-runtime.json' with { type: 'json' };
import publicApi from './public-api.json' with { type: 'json' };
import { integrations } from './connected-data.ts';
import { crawlLogs } from './crawl-logs.ts';
import { mcp } from './mcp.ts';
import type { SettingSpec } from './settings.ts';

const defaults = {
  login_email_limit: 10,
  login_client_limit: 30,
  login_window_seconds: 300,
  login_challenge_failures: 5,
  login_failure_global_limit: 200,
  register_client_limit: 20,
  register_window_seconds: 86400,
  mcp_register_burst_limit: 3,
  mcp_register_burst_window_seconds: 60,
  mcp_register_client_limit: 10,
  mcp_register_client_window_seconds: 600,
  mcp_register_global_limit: 300,
  mcp_register_global_window_seconds: 3600,
  mcp_authorize_unapproved_network_limit: 10,
  agent_call_limit: 30,
  agent_call_window_seconds: 86400,
  bulk_import_limit: 10,
  bulk_import_window_seconds: 3600,
  provider_test_limit: 20,
  provider_test_window_seconds: 3600,
  property_discovery_limit: 60,
  property_discovery_window_seconds: 3600,
  crawl_create_limit: 10,
  crawl_create_window_seconds: 86400,
  brand_logo_refresh_limit: 10,
  brand_logo_refresh_window_seconds: 3600,
  client_error_client_limit: 20,
  client_error_window_seconds: 600,
  csp_report_client_limit: 20,
  csp_report_window_seconds: 600,
  active_audits_per_workspace: 3,
  audit_tasks_per_workspace_daily: 1500,
  active_agent_runs_per_workspace: 5,
  agent_runs_per_workspace_daily: 200,
  active_brand_discoveries_per_workspace: 3,
  brand_discoveries_per_workspace_daily: 20,
  commerce_discoveries_per_workspace_daily: 50,
  internal_link_analyses_per_workspace_daily: 10,
  prompt_judge_calls_per_workspace_daily: 500,
  active_job_retry_after_seconds: 60,
  sse_streams_per_user: 3,
  sse_access_recheck_seconds: 30,
  usage_window_cleanup_batch: 500,
  security_event_retention_days: 30,
  security_event_prune_batch: 1000,
};

export const abuse = Object.fromEntries(
  Object.entries(defaults).map(([name, value]) => [
    name,
    { env: [`ABUSE_${name.toUpperCase()}`], type: 'int', default: value, minimum: 1 },
  ]),
) as Record<
  keyof typeof defaults,
  { env: string[]; type: string; default: number; minimum: number }
>;

export type BudgetSubject =
  | 'api_key'
  | 'workspace'
  | 'client'
  | 'email'
  | 'crawl_source'
  | 'crawl_project'
  | 'global'
  | 'mcp_client'
  | 'mcp_grant'
  | 'user'
  | 'integration_connection';

export const clientNetworkPrefixes = { client: 64, registration: 56 } as const;
export type ClientNetworkScope = keyof typeof clientNetworkPrefixes;

type BudgetValue = number | SettingSpec;

type Budget = {
  operation: string;
  subject: BudgetSubject;
  limit: BudgetValue;
  windowSeconds: BudgetValue;
};

export const GLOBAL_MAIL_SUBJECT = 'global-mail';
export const GLOBAL_TRIAL_SUBJECT = 'global-trial';
export const MCP_REGISTER_SUBJECT = 'mcp.register';
export const MCP_AUTHORIZE_SUBJECT = 'mcp.authorize';
export const LOGIN_FAILURE_GLOBAL_SUBJECT = 'auth.login.failure';

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3600;
const mailbox = authRuntime.mailbox;
const integrationSettings = integrations.settings;
const mcpLimits = mcp.constants;
const daily = (operation: string, limit: SettingSpec): Budget => ({
  operation,
  subject: 'workspace',
  limit,
  windowSeconds: DAY_SECONDS,
});

export const budgets = {
  agent_provider_call: {
    operation: 'agent.provider_call',
    subject: 'workspace',
    limit: abuse.agent_call_limit,
    windowSeconds: abuse.agent_call_window_seconds,
  },
  agent_runs: {
    operation: 'agent.runs',
    subject: 'workspace',
    limit: abuse.agent_runs_per_workspace_daily,
    windowSeconds: abuse.agent_call_window_seconds,
  },
  audit_provider_tasks: daily('audit.provider_tasks', abuse.audit_tasks_per_workspace_daily),
  brand_discovery: daily('brand_discovery.create', abuse.brand_discoveries_per_workspace_daily),
  commerce_discovery: daily(
    'commerce.competitor_discovery',
    abuse.commerce_discoveries_per_workspace_daily,
  ),
  internal_link_analysis: daily(
    'internal_links.analysis',
    abuse.internal_link_analyses_per_workspace_daily,
  ),
  prompt_judge_calls: daily(
    'prompt_generation.judge',
    abuse.prompt_judge_calls_per_workspace_daily,
  ),
  bulk_import: {
    operation: 'bulk_import',
    subject: 'workspace',
    limit: abuse.bulk_import_limit,
    windowSeconds: abuse.bulk_import_window_seconds,
  },
  brand_logo_refresh: {
    operation: 'brand_logo_refresh',
    subject: 'workspace',
    limit: abuse.brand_logo_refresh_limit,
    windowSeconds: abuse.brand_logo_refresh_window_seconds,
  },
  provider_connection_test: {
    operation: 'provider.connection_test',
    subject: 'workspace',
    limit: abuse.provider_test_limit,
    windowSeconds: abuse.provider_test_window_seconds,
  },
  crawl_create: {
    operation: 'site_health.crawl_create',
    subject: 'workspace',
    limit: abuse.crawl_create_limit,
    windowSeconds: abuse.crawl_create_window_seconds,
  },
  integration_properties: {
    operation: 'integrations.properties',
    subject: 'integration_connection',
    limit: abuse.property_discovery_limit,
    windowSeconds: abuse.property_discovery_window_seconds,
  },
  integration_sync: {
    operation: 'integrations.sync.on_demand',
    subject: 'workspace',
    limit: integrationSettings.sync_on_demand_request_limit,
    windowSeconds: integrationSettings.sync_on_demand_request_window_seconds,
  },
  login_email_failure: {
    operation: 'auth.login.email_failure',
    subject: 'email',
    limit: abuse.login_email_limit,
    windowSeconds: abuse.login_window_seconds,
  },
  login_email_challenge: {
    operation: 'auth.login.email_failure',
    subject: 'email',
    limit: abuse.login_challenge_failures,
    windowSeconds: abuse.login_window_seconds,
  },
  login_network_challenge: {
    operation: 'auth.login.network_failure',
    subject: 'client',
    limit: abuse.login_challenge_failures,
    windowSeconds: abuse.login_window_seconds,
  },
  login_global_challenge: {
    operation: 'auth.login.global_failure',
    subject: 'global',
    limit: abuse.login_failure_global_limit,
    windowSeconds: abuse.login_window_seconds,
  },
  login_client: {
    operation: 'auth.login.client',
    subject: 'client',
    limit: abuse.login_client_limit,
    windowSeconds: abuse.login_window_seconds,
  },
  register_client: {
    operation: 'auth.register.client',
    subject: 'client',
    limit: abuse.register_client_limit,
    windowSeconds: abuse.register_window_seconds,
  },
  client_error_report: {
    operation: 'client_errors.report',
    subject: 'client',
    limit: abuse.client_error_client_limit,
    windowSeconds: abuse.client_error_window_seconds,
  },
  csp_report: {
    operation: 'client_errors.csp_report',
    subject: 'client',
    limit: abuse.csp_report_client_limit,
    windowSeconds: abuse.csp_report_window_seconds,
  },
  mailbox_request_client: {
    operation: 'auth.mailbox.request',
    subject: 'client',
    limit: mailbox.request_limit,
    windowSeconds: mailbox.request_window_seconds,
  },
  mailbox_request_email: {
    operation: 'auth.mailbox.request',
    subject: 'email',
    limit: mailbox.request_limit,
    windowSeconds: mailbox.request_window_seconds,
  },
  mail_cooldown: {
    operation: 'auth.mail.cooldown',
    subject: 'email',
    limit: 1,
    windowSeconds: mailbox.cooldown_seconds,
  },
  mail_recipient_daily: {
    operation: 'auth.mail.daily',
    subject: 'email',
    limit: mailbox.recipient_daily_limit,
    windowSeconds: mailbox.daily_window_seconds,
  },
  mail_global_daily: {
    operation: 'auth.mail.global',
    subject: 'global',
    limit: mailbox.global_daily_limit,
    windowSeconds: mailbox.daily_window_seconds,
  },
  trial_global_daily: {
    operation: 'auth.trial.global',
    subject: 'global',
    limit: mailbox.trial_daily_limit,
    windowSeconds: mailbox.daily_window_seconds,
  },
  crawl_log_batches: {
    operation: 'crawl_logs.batch',
    subject: 'crawl_source',
    get limit() {
      return crawlLogs.batches_per_source_per_hour;
    },
    windowSeconds: HOUR_SECONDS,
  },
  crawl_log_lines: {
    operation: 'crawl_logs.accepted_lines',
    subject: 'crawl_project',
    get limit() {
      return crawlLogs.accepted_lines_per_project_per_day;
    },
    windowSeconds: DAY_SECONDS,
  },
  public_api_key: {
    operation: publicApi.rate_limits.api_key.operation,
    subject: 'api_key',
    limit: publicApi.rate_limits.api_key.limit,
    windowSeconds: publicApi.rate_limits.api_key.window_seconds,
  },
  public_api_workspace: {
    operation: publicApi.rate_limits.workspace.operation,
    subject: 'workspace',
    limit: publicApi.rate_limits.workspace.limit,
    windowSeconds: publicApi.rate_limits.workspace.window_seconds,
  },
  mcp_register_burst: {
    operation: 'mcp.register.burst',
    subject: 'client',
    limit: abuse.mcp_register_burst_limit,
    windowSeconds: abuse.mcp_register_burst_window_seconds,
  },
  mcp_register_client: {
    operation: 'mcp.register.client',
    subject: 'client',
    limit: abuse.mcp_register_client_limit,
    windowSeconds: abuse.mcp_register_client_window_seconds,
  },
  mcp_register_global: {
    operation: 'mcp.register.global',
    subject: 'global',
    limit: abuse.mcp_register_global_limit,
    windowSeconds: abuse.mcp_register_global_window_seconds,
  },
  mcp_authorize_client: {
    operation: 'mcp.authorize.client',
    subject: 'mcp_client',
    limit: mcpLimits.authorization_client_limit,
    windowSeconds: mcpLimits.authorization_window_seconds,
  },
  mcp_authorize_source: {
    operation: 'mcp.authorize.source',
    subject: 'client',
    limit: mcpLimits.authorization_source_limit,
    windowSeconds: mcpLimits.authorization_window_seconds,
  },
  mcp_authorize_global: {
    operation: 'mcp.authorize.global',
    subject: 'global',
    limit: mcpLimits.authorization_global_limit,
    windowSeconds: mcpLimits.authorization_window_seconds,
  },
  mcp_authorize_unapproved_network: {
    operation: 'mcp.authorize.unapproved_network',
    subject: 'client',
    limit: abuse.mcp_authorize_unapproved_network_limit,
    windowSeconds: mcpLimits.authorization_window_seconds,
  },
  mcp_tool_call_grant: {
    operation: 'mcp.tool_call.grant',
    subject: 'mcp_grant',
    limit: mcpLimits.tool_call_grant_limit,
    windowSeconds: mcpLimits.tool_call_window_seconds,
  },
  mcp_tool_call_user: {
    operation: 'mcp.tool_call.user',
    subject: 'user',
    limit: mcpLimits.tool_call_user_limit,
    windowSeconds: mcpLimits.tool_call_window_seconds,
  },
  mcp_write_call_grant: {
    operation: 'mcp.write_call.grant',
    subject: 'mcp_grant',
    limit: mcpLimits.write_call_grant_limit,
    windowSeconds: mcpLimits.tool_call_window_seconds,
  },
} satisfies Record<string, Budget>;

export type BudgetName = keyof typeof budgets;
