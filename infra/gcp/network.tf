resource "google_compute_network" "main" {
  name                    = local.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# Cloud Run reaches PostgreSQL through Direct VPC egress from this subnet. The
# database VM has no external address; Private Google Access lets it read its
# secret and pull its image from Artifact Registry without NAT.
resource "google_compute_subnetwork" "main" {
  name                     = local.name
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = local.subnet_cidr
  private_ip_google_access = true

  # Sampled, aggregated flow logs keep an audit trail of database access at
  # negligible cost for this low-traffic subnet.
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "EXCLUDE_ALL_METADATA"
  }
}

resource "google_compute_address" "db" {
  name         = "${local.name}-db"
  region       = var.region
  subnetwork   = google_compute_subnetwork.main.id
  address_type = "INTERNAL"
  address      = local.db_address
}

resource "google_compute_firewall" "postgres" {
  name      = "${local.name}-postgres"
  network   = google_compute_network.main.name
  direction = "INGRESS"
  priority  = 1000

  source_ranges           = [local.subnet_cidr]
  target_service_accounts = [google_service_account.db.email]

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }
}

# Operator break-glass shell through IAP only; nothing else reaches the VM.
resource "google_compute_firewall" "iap_ssh" {
  name      = "${local.name}-iap-ssh"
  network   = google_compute_network.main.name
  direction = "INGRESS"
  priority  = 1000

  source_ranges           = ["35.235.240.0/20"]
  target_service_accounts = [google_service_account.db.email]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
