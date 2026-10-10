output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

# The Workers' ORIGIN_UPSTREAM: the deterministic run.app URL of the API.
output "api_url" {
  value = "https://${google_cloud_run_v2_service.api.name}-${data.google_project.current.number}.${var.region}.run.app"
}

# The service account customers grant on their crawl-log subscription.
output "crawl_log_reader_email" {
  value = google_service_account.log_reader.email
}

output "db_instance" {
  value = google_compute_instance.db.name
}

output "migrate_job" {
  value = google_cloud_run_v2_job.migrate.name
}

output "tick_job" {
  value = google_cloud_run_v2_job.execution["tick"].name
}

output "db_address" {
  value = google_compute_address.db.address
}
