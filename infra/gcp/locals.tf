locals {
  name = "citeladder"
  labels = {
    project     = "citeladder"
    environment = "production"
    managed_by  = "terraform"
  }

  subnet_cidr = "10.28.0.0/24"
  # Fixed so the deploy workflow can compose DATABASE_URL before Terraform runs.
  db_address = cidrhost(local.subnet_cidr, 10)

  # Generated once by the deploy workflow, or copied from protected GitHub secrets.
  required_secret_env = {
    OAUTH_GOOGLE_CLIENT_ID           = "citeladder-google-oauth-client-id"
    OAUTH_GOOGLE_CLIENT_SECRET       = "citeladder-google-oauth-client-secret"
    DATABASE_URL                     = "citeladder-database-url"
    JWT_SECRET_KEY                   = "citeladder-jwt-secret"
    ENCRYPTION_KEY                   = "citeladder-encryption-key"
    REFERRAL_HASH_SALT               = "citeladder-referral-salt"
    API_KEY_PEPPER                   = "citeladder-api-key-pepper"
    DEV_LOGIN_PASSWORD               = "citeladder-demo-password"
    INTEGRATION_GOOGLE_CLIENT_ID     = "citeladder-google-oauth-client-id"
    INTEGRATION_GOOGLE_CLIENT_SECRET = "citeladder-google-oauth-client-secret"
  }
  # Present only while the protected environment supplies a value; Cloud Run
  # cannot reference a secret without an enabled version.
  optional_secret_env = {
    RESEND_API_KEY                      = "citeladder-resend-api-key"
    DEFAULT_AGENT_API_KEY               = "citeladder-default-agent-api-key"
    KEENABLE_API_KEY                    = "citeladder-keenable-api-key"
    JEV_API_KEY                         = "citeladder-jev-api-key"
    TAVILY_API_KEY                      = "citeladder-tavily-api-key"
    INTEGRATION_MICROSOFT_CLIENT_ID     = "citeladder-bing-oauth-client-id"
    INTEGRATION_MICROSOFT_CLIENT_SECRET = "citeladder-bing-oauth-client-secret"
    DATAFORSEO_API_LOGIN                = "citeladder-dataforseo-login"
    DATAFORSEO_API_PASSWORD             = "citeladder-dataforseo-password"
  }
  api_secret_env = {
    CITELADDER_ORIGIN_TOKEN = "citeladder-worker-origin-token"
  }
  api_optional_secret_env = {
    CITELADDER_ORIGIN_TOKEN_PREVIOUS = "citeladder-worker-origin-token-previous"
  }

  runtime_secret_ids = toset(concat(
    ["citeladder-db-password"],
    values(local.required_secret_env),
    values(local.optional_secret_env),
    values(local.api_secret_env),
    values(local.api_optional_secret_env),
  ))

  shared_secret_env = merge(
    local.required_secret_env,
    { for name, id in local.optional_secret_env : name => id if contains(var.optional_secrets, id) },
  )
  api_only_secret_env = merge(
    local.api_secret_env,
    { for name, id in local.api_optional_secret_env : name => id if contains(var.optional_secrets, id) },
  )

  runner_job = "projects/${var.project_id}/locations/${var.region}/jobs/${local.name}-runner"

  # Non-secret configuration shared by the API, runner, tick and migration.
  shared_env = merge(
    {
      APP_ENV                     = "production"
      DB_SSL_MODE                 = "require"
      DB_MAX_OVERFLOW             = "0"
      FRONTEND_URL                = "https://${var.app_domain_name}"
      MCP_ENABLED                 = "true"
      MCP_PUBLIC_BASE_URL         = "https://${var.domain_name}"
      PUBLIC_API_URL              = "https://api.${var.domain_name}"
      CRAWL_LOG_READER_EMAIL      = google_service_account.log_reader.email
      MCP_ALLOWED_ACCOUNT_EMAIL   = var.demo_mode ? var.dev_login_email : ""
      DEMO_MODE                   = tostring(var.demo_mode)
      DEMO_MONITORED_URL_LIMIT    = "50000"
      DEV_LOGIN_EMAIL             = var.dev_login_email
      DEV_LOGIN_COUNTER_ALLOWANCE = tostring(var.dev_login_counter_allowance)
      OAUTH_GOOGLE_ENABLED        = tostring(var.oauth_google_enabled)
      OAUTH_GOOGLE_REDIRECT_URI   = "https://${var.app_domain_name}/api/v1/auth/oauth/google/callback"
      PUBLIC_SIGNUP_ENABLED       = tostring(var.public_signup_enabled)
      # Cloud Run's front end; admitted Worker requests name the visitor instead.
      TRUSTED_PROXY_CIDRS              = "169.254.0.0/16"
      DEFAULT_AGENT_BASE_URL           = var.agent_base_url
      DEFAULT_AGENT_MODEL              = var.agent_model
      SITE_HEALTH_AUTOMATIC_PAGE_LIMIT = "200"
      SITE_HEALTH_GLOBAL_CONCURRENCY   = "8"
      SITE_HEALTH_PER_HOST_CONCURRENCY = "6"
      RUNNER_BUDGET_SECONDS            = tostring(var.runner_budget_seconds)
      RUNNER_DB_POOL_SIZE              = "4"
    },
    var.demo_expires_at == "" ? {} : { DEMO_EXPIRES_AT = var.demo_expires_at },
  )
}
