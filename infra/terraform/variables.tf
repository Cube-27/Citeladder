variable "aws_region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "The CiteLadder demo is fixed to us-east-1."
  }
}

variable "domain_name" {
  type    = string
  default = "citeladder.com"
}

variable "backend_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.backend_image))
    error_message = "backend_image must be an immutable image digest."
  }
}

variable "frontend_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.frontend_image))
    error_message = "frontend_image must be an immutable image digest."
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

variable "task_cpu" {
  type    = number
  default = 2048
  validation {
    condition     = contains([2048, 4096], var.task_cpu)
    error_message = "task_cpu must be a supported reviewed demo size."
  }
}

variable "task_memory" {
  type    = number
  default = 4096
  validation {
    condition     = contains([4096, 8192], var.task_memory)
    error_message = "task_memory must be 4096 or 8192 MiB."
  }
}

variable "desired_count" {
  type    = number
  default = 1
  validation {
    condition     = contains([0, 1], var.desired_count)
    error_message = "The demo desired count must be zero or one."
  }
}
