variable "project_id" {
  type        = string
  description = "Dedicated disposable GCP project ID."
}

variable "billing_account" {
  type        = string
  description = "Billing account used by the configured demo-cost alert."
  sensitive   = true
}

variable "budget_currency_code" {
  type        = string
  description = "ISO 4217 currency code matching the billing account."
  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency_code))
    error_message = "budget_currency_code must be a three-letter uppercase ISO 4217 code."
  }
}

variable "budget_units" {
  type        = number
  description = "Positive whole-unit budget amount in the billing account currency."
  validation {
    condition     = var.budget_units > 0 && floor(var.budget_units) == var.budget_units
    error_message = "budget_units must be a positive whole number."
  }
}

variable "region" {
  type    = string
  default = "asia-south1"
  validation {
    condition     = var.region == "asia-south1"
    error_message = "The temporary demo is fixed to asia-south1 (Mumbai)."
  }
}

variable "zone" {
  type    = string
  default = "asia-south1-a"
  validation {
    condition     = var.zone == "asia-south1-a"
    error_message = "The temporary demo is fixed to asia-south1-a."
  }
}

variable "domain_name" {
  type    = string
  default = "citeladder.cube27.com"
  validation {
    condition = length(var.domain_name) <= 253 && alltrue([
      for label in split(".", var.domain_name) :
      length(label) >= 1 && length(label) <= 63 &&
      can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", label))
    ])
    error_message = "domain_name must be a lower-case DNS hostname."
  }
}

variable "backend_image" {
  type = string
  validation {
    condition = startswith(
      var.backend_image,
      "${var.region}-docker.pkg.dev/${var.project_id}/citeladder-demo/backend@sha256:"
    ) && can(regex("@sha256:[0-9a-f]{64}$", var.backend_image))
    error_message = "backend_image must be an immutable Artifact Registry digest."
  }
}

variable "frontend_image" {
  type = string
  validation {
    condition = startswith(
      var.frontend_image,
      "${var.region}-docker.pkg.dev/${var.project_id}/citeladder-demo/frontend@sha256:"
    ) && can(regex("@sha256:[0-9a-f]{64}$", var.frontend_image))
    error_message = "frontend_image must be an immutable Artifact Registry digest."
  }
}

variable "demo_expires_at" {
  type = string
  validation {
    condition     = can(timecmp(var.demo_expires_at, timestamp()))
    error_message = "demo_expires_at must be an RFC3339 timestamp."
  }
}

variable "cloudflare_ipv4_cidrs" {
  type = set(string)
  validation {
    condition = length(var.cloudflare_ipv4_cidrs) > 0 && alltrue([
      for cidr in var.cloudflare_ipv4_cidrs : can(cidrnetmask(cidr)) && cidr != "0.0.0.0/0"
    ])
    error_message = "A non-empty, non-catch-all Cloudflare IPv4 set is required."
  }
}

variable "cloudflare_ipv6_cidrs" {
  type = set(string)
  validation {
    condition = length(var.cloudflare_ipv6_cidrs) > 0 && alltrue([
      for cidr in var.cloudflare_ipv6_cidrs : can(cidrhost(cidr, 0)) && strcontains(cidr, ":") && cidr != "::/0"
    ])
    error_message = "A non-empty, non-catch-all Cloudflare IPv6 set is required."
  }
}

variable "machine_type" {
  type    = string
  default = "e2-standard-2"
  validation {
    condition     = var.machine_type == "e2-standard-2"
    error_message = "The reviewed temporary-demo size is e2-standard-2."
  }
}
