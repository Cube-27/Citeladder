resource "google_compute_network" "demo" {
  name                    = local.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "demo" {
  name                     = local.name
  region                   = var.region
  network                  = google_compute_network.demo.id
  ip_cidr_range            = "10.27.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_address" "demo" {
  name         = local.name
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
}

resource "google_compute_firewall" "cloudflare_web" {
  name      = "${local.name}-cloudflare-web"
  network   = google_compute_network.demo.name
  direction = "INGRESS"
  priority  = 1000

  source_ranges           = concat(sort(tolist(var.cloudflare_ipv4_cidrs)), sort(tolist(var.cloudflare_ipv6_cidrs)))
  target_service_accounts = [google_service_account.vm.email]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name      = "${local.name}-iap-ssh"
  network   = google_compute_network.demo.name
  direction = "INGRESS"
  priority  = 1000

  source_ranges           = ["35.235.240.0/20"]
  target_service_accounts = [google_service_account.vm.email]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
