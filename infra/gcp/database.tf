data "google_compute_image" "cos" {
  family  = "cos-stable"
  project = "cos-cloud"
}

# Free-tier e2-micro with a 30 GB standard boot disk. PostgreSQL is the only
# process; its data lives on the boot disk, so replacing this instance is the
# explicit database reset (no backups are kept by design).
resource "google_compute_instance" "db" {
  name                      = "${local.name}-db"
  zone                      = var.zone
  machine_type              = "e2-micro"
  allow_stopping_for_update = true
  deletion_protection       = false
  can_ip_forward            = false
  labels                    = local.labels

  boot_disk {
    auto_delete = true
    initialize_params {
      image = data.google_compute_image.cos.self_link
      size  = 30
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.main.id
    network_ip = google_compute_address.db.address
    # No access_config: the database never has a public address.
  }

  service_account {
    email  = google_service_account.db.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    serial-port-enable     = "FALSE"
    google-logging-enabled = "true"
    startup-script = templatefile("${path.module}/postgres-vm.sh", {
      postgres_image = var.postgres_image
      registry_host  = "${var.region}-docker.pkg.dev"
      project_id     = var.project_id
      db_address     = local.db_address
      client_cidr    = local.subnet_cidr
    })
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # A newer COS image must not replace the stateful database during a deploy.
  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }

  # The startup script reads its secret and pulls its image on first boot.
  depends_on = [
    google_secret_manager_secret_iam_member.db_password,
    google_artifact_registry_repository_iam_member.db_reader,
    google_project_iam_member.db_logging,
  ]
}
