output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "backup_bucket" {
  value = google_storage_bucket.backups.name
}

output "demo_expires_at" {
  value = var.demo_expires_at
}

output "demo_url" {
  value = "https://${var.domain_name}"
}

output "static_ip" {
  value = google_compute_address.demo.address
}

output "vm_name" {
  value = google_compute_instance.demo.name
}

output "vm_service_account" {
  value = google_service_account.vm.email
}
