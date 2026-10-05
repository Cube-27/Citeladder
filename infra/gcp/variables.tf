variable "project_id" {
  type        = string
  description = "Existing CiteLadder GCP project ID (reused; never recreated)."
}

variable "billing_account" {
  type        = string
  description = "Billing account that owns the monthly budget alert."
  sensitive   = true
}

variable "budget_currency_code" {
  type        = string
  default     = "INR"
  description = "ISO 4217 currency code matching the billing account."
  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency_code))
    error_message = "budget_currency_code must be a three-letter uppercase ISO 4217 code."
  }
}

variable "budget_units" {
  type        = number
  default     = 500
  description = "Monthly fixed-hosting budget in whole billing-currency units."
  validation {
    condition     = var.budget_units > 0 && floor(var.budget_units) == var.budget_units
    error_message = "budget_units must be a positive whole number."
  }
}

variable "region" {
  type    = string
  default = "us-central1"
  validation {
    # The e2-micro and 30 GB standard disk free tier applies in us-central1.
    condition     = var.region == "us-central1"
    error_message = "The low-cost deployment is fixed to us-central1."
  }
}

variable "zone" {
  type    = string
  default = "us-central1-a"
  validation {
    condition     = can(regex("^us-central1-[a-z]$", var.zone))
    error_message = "The zone must be in us-central1."
  }
}

variable "domain_name" {
  type        = string
  default     = "citeladder.com"
  description = "Apex host served by the marketing Worker and used as the MCP origin."
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$", var.domain_name))
    error_message = "domain_name must be a lower-case DNS hostname."
  }
}

variable "app_domain_name" {
  type        = string
  default     = "app.citeladder.com"
  description = "Product Worker host; FRONTEND_URL and OAuth redirects derive from it."
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$", var.app_domain_name)) && var.app_domain_name != var.domain_name
    error_message = "app_domain_name must be a lower-case DNS hostname distinct from domain_name."
  }
}

variable "api_image" {
  type        = string
  description = "API service image (API, runner and tick) by immutable digest."
  validation {
    condition     = can(regex("^us-central1-docker\\.pkg\\.dev/[a-z0-9-]+/citeladder/api-service@sha256:[0-9a-f]{64}$", var.api_image))
    error_message = "api_image must be an immutable citeladder/api-service digest."
  }
}

variable "migrate_image" {
  type        = string
  description = "Alembic/schema image with native bootstrap by immutable digest."
  validation {
    condition     = can(regex("^us-central1-docker\\.pkg\\.dev/[a-z0-9-]+/citeladder/backend@sha256:[0-9a-f]{64}$", var.migrate_image))
    error_message = "migrate_image must be an immutable citeladder/backend digest."
  }
}

variable "postgres_image" {
  type        = string
  description = "PostgreSQL 16 image mirrored into Artifact Registry by immutable digest."
  validation {
    condition     = can(regex("^us-central1-docker\\.pkg\\.dev/[a-z0-9-]+/citeladder/postgres@sha256:[0-9a-f]{64}$", var.postgres_image))
    error_message = "postgres_image must be an immutable citeladder/postgres digest."
  }
}

variable "optional_secrets" {
  type        = set(string)
  default     = []
  description = "Optional runtime secret IDs that currently hold an enabled version."
}

variable "agent_base_url" {
  type        = string
  description = "HTTPS base URL of the platform OpenAI-compatible Agent provider."
  validation {
    condition     = startswith(var.agent_base_url, "https://")
    error_message = "agent_base_url must be an HTTPS URL."
  }
}

variable "agent_model" {
  type        = string
  description = "Exact provider model identifier used by the Agent."
  validation {
    condition     = length(trimspace(var.agent_model)) > 0
    error_message = "agent_model is required."
  }
}

variable "demo_mode" {
  type        = bool
  default     = false
  description = "true restores the single-account demo (no registration, MCP pinned to one account)."
}

variable "demo_expires_at" {
  type        = string
  default     = ""
  description = "RFC 3339 expiry, required only in demo mode."
}

variable "dev_login_email" {
  type    = string
  default = "dev@citeladder.com"
}

variable "dev_login_counter_allowance" {
  type    = number
  default = 200
}

variable "oauth_google_enabled" {
  type        = bool
  default     = false
  description = "Google sign-in; a first Google sign-in creates an account."
}

variable "public_signup_enabled" {
  type    = bool
  default = false
}

variable "runner_budget_seconds" {
  type    = number
  default = 300
  validation {
    condition     = var.runner_budget_seconds >= 60 && var.runner_budget_seconds <= 3000
    error_message = "runner_budget_seconds must be between 60 and 3000."
  }
}

variable "tick_schedule" {
  type        = string
  default     = "*/10 * * * *"
  description = "Cron schedule (UTC) for the periodic tick; API writes wake the runner directly."
}
