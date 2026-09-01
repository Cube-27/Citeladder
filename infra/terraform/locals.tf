locals {
  name = "citeladder-demo"
  tags = {
    Project     = "CiteLadder"
    Environment = "demo"
    ManagedBy   = "Terraform"
    ExpiresAt   = var.demo_expires_at
  }

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  backend_environment = [
    { name = "APP_ENV", value = "production" },
    { name = "DEMO_MODE", value = "true" },
    { name = "DEMO_EXPIRES_AT", value = var.demo_expires_at },
    { name = "DEV_LOGIN_EMAIL", value = "dev@citeladder.com" },
    { name = "FRONTEND_URL", value = "https://${var.domain_name}" },
    { name = "FRONTEND_ORIGINS", value = "https://${var.domain_name}" },
    { name = "TRUSTED_PROXY_CIDRS", value = join(",", concat(["127.0.0.1/32", "::1/128"], sort(tolist(var.cloudflare_ipv4_cidrs)), sort(tolist(var.cloudflare_ipv6_cidrs)))) },
    { name = "DB_SSL_MODE", value = "require" },
    { name = "JWT_ALGORITHM", value = "HS256" },
    { name = "JWT_EXPIRE_HOURS", value = "24" },
    { name = "DB_POOL_SIZE", value = "20" },
    { name = "DB_MAX_OVERFLOW", value = "4" },
  ]

  core_secret_keys = ["DATABASE_URL", "JWT_SECRET_KEY", "ENCRYPTION_KEY", "REFERRAL_HASH_SALT"]
  core_secrets = [for key in local.core_secret_keys : {
    name      = key
    valueFrom = "${aws_secretsmanager_secret.runtime.arn}:${key}::"
  }]
  migrate_secrets = concat(local.core_secrets, [{
    name      = "DEV_LOGIN_PASSWORD"
    valueFrom = "${aws_secretsmanager_secret.runtime.arn}:DEV_LOGIN_PASSWORD::"
  }])

  log_configuration = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.demo.name
      awslogs-region        = var.aws_region
      awslogs-stream-prefix = "ecs"
    }
  }

  worker_commands = {
    audit-worker           = ["python", "-m", "app.workers.audit_worker"]
    audit-scheduler        = ["python", "-m", "app.workers.audit_scheduler"]
    site-health-worker     = ["python", "-m", "app.workers.site_health_worker"]
    brand-discovery-worker = ["python", "-m", "app.workers.brand_discovery_worker"]
    content-worker         = ["python", "-m", "app.workers.content_worker"]
    agent-worker           = ["python", "-m", "app.workers.agent_worker"]
    analytics-worker       = ["python", "-m", "app.workers.analytics_worker"]
    queue-sweeper          = ["python", "-m", "app.workers.queue_sweeper"]
    integration-worker     = ["python", "-m", "app.workers.integration_worker"]
    integration-dispatcher = ["python", "-m", "app.workers.integration_dispatcher"]
  }
}
