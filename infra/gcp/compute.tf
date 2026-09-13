data "google_compute_image" "debian" {
  family  = "debian-12"
  project = "debian-cloud"
}

resource "google_compute_instance" "demo" {
  name                      = local.name
  zone                      = var.zone
  machine_type              = var.machine_type
  allow_stopping_for_update = true
  deletion_protection       = false
  can_ip_forward            = false
  tags                      = [local.name]
  labels                    = local.labels

  boot_disk {
    auto_delete = true
    initialize_params {
      image = data.google_compute_image.debian.self_link
      size  = 30
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.demo.id
    # The static external address is the origin for the proxied Cloudflare A
    # record. Ingress remains limited to Cloudflare web CIDRs and IAP SSH by
    # network.tf; removing this address would remove the single-VM origin.
    access_config {
      nat_ip       = google_compute_address.demo.address
      network_tier = "PREMIUM"
    }
  }

  service_account {
    email = google_service_account.vm.email
    # Google recommends the cloud-platform access scope for a user-managed VM
    # identity, with effective access constrained by the IAM roles in
    # identity.tf. The runtime needs Artifact Registry, Secret Manager, and
    # bucket-scoped backup access.
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    serial-port-enable     = "FALSE"
  }

  metadata_startup_script = file("${path.module}/runtime/bootstrap-vm.sh")

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # The image family resolves to a newer image over time. That is appropriate
  # for first creation, but must not replace the stateful single-VM demo during
  # an ordinary application deployment.
  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }
}
