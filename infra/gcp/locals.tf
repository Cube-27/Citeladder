locals {
  name = "citeladder-demo"
  labels = {
    project     = "citeladder"
    environment = "demo"
    managed_by  = "terraform"
  }
  runtime_secret_ids = toset([
    "citeladder-db-password",
    "citeladder-jwt-secret",
    "citeladder-encryption-key",
    "citeladder-referral-salt",
    "citeladder-demo-password",
    "citeladder-cloudflare-origin-cert",
    "citeladder-cloudflare-origin-key",
    "citeladder-content-api-key",
    "citeladder-default-agent-api-key",
    "citeladder-keenable-api-key",
    "citeladder-tavily-api-key",
  ])
}
