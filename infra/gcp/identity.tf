resource "google_service_account" "db" {
  account_id   = "${local.name}-db"
  display_name = "CiteLadder PostgreSQL VM"
}

resource "google_service_account" "runtime" {
  account_id   = "${local.name}-runtime"
  display_name = "CiteLadder Cloud Run API, runner, tick and migration"
}

resource "google_service_account" "scheduler" {
  account_id   = "${local.name}-scheduler"
  display_name = "CiteLadder tick scheduler"
}

# Customers grant this identity subscriber and viewer on their own Pub/Sub
# subscription; it holds no role in this project and has no key.
resource "google_service_account" "log_reader" {
  account_id   = "${local.name}-log-reader"
  display_name = "CiteLadder crawl-log reader (customer Pub/Sub subscriptions)"
}

# The runtime mints short-lived reader tokens through IAM Credentials.
resource "google_service_account_iam_member" "runtime_impersonates_log_reader" {
  service_account_id = google_service_account.log_reader.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "db_logging" {
  for_each = toset(["roles/logging.logWriter", "roles/monitoring.metricWriter"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.db.email}"
}

resource "google_artifact_registry_repository_iam_member" "db_reader" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.db.email}"
}

resource "google_secret_manager_secret_iam_member" "db_password" {
  secret_id = google_secret_manager_secret.runtime["citeladder-db-password"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.db.email}"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = toset(concat(
    values(local.required_secret_env),
    values(local.optional_secret_env),
    values(local.api_secret_env),
    values(local.api_optional_secret_env),
  ))
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# The API starts a runner execution after committed work, and a runner or tick
# starts its successor when work is still due (run.jobs.run only).
resource "google_cloud_run_v2_job_iam_member" "api_starts_runner" {
  name     = google_cloud_run_v2_job.execution["runner"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_starts_tick" {
  name     = google_cloud_run_v2_job.execution["tick"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}
