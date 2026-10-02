/** PostgreSQL-enforced abuse budgets; all environment overrides must be positive integers. */
const defaults = {
  login_email_limit: 10,
  login_client_limit: 30,
  login_window_seconds: 300,
  register_client_limit: 20,
  register_window_seconds: 86400,
  mcp_register_burst_limit: 3,
  mcp_register_burst_window_seconds: 60,
  mcp_register_client_limit: 10,
  mcp_register_client_window_seconds: 600,
  mcp_register_global_limit: 300,
  mcp_register_global_window_seconds: 3600,
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
  active_audits_per_workspace: 3,
  audit_tasks_per_workspace_daily: 1500,
  active_agent_runs_per_workspace: 5,
  agent_runs_per_workspace_daily: 200,
  active_job_retry_after_seconds: 60,
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
