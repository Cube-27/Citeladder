variable "project_id" {
  type        = string
  description = "Dedicated disposable GCP project ID."
}

variable "billing_account" {
  type        = string
  description = "Billing account used by the USD 25 alert."
  sensitive   = true
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
    condition     = startswith(var.zone, "asia-south1-")
    error_message = "The demo VM must remain in asia-south1."
  }
}

variable "domain_name" {
  type    = string
  default = "citeladder.com"
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$", var.domain_name))
    error_message = "domain_name must be a lower-case DNS hostname."
  }
}

variable "backend_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.backend_image))
    error_message = "backend_image must be an immutable Artifact Registry digest."
  }
}

variable "frontend_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.frontend_image))
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
