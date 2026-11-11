resource "google_service_account" "db" {
  account_id   = "${local.name}-db"
  display_name = "CiteLadder PostgreSQL VM"
}

# The API service; alone reads the Worker origin tokens and the Turnstile
# secret. Its account ID predates the separate job identity: the jobs moved
# off it, so the serving API never loses a grant during the cutover.
resource "google_service_account" "runtime" {
  account_id   = "${local.name}-runtime"
  display_name = "CiteLadder Cloud Run API"
}

# The runner, migrate and billing jobs.
resource "google_service_account" "jobs" {
  account_id   = "${local.name}-jobs"
  display_name = "CiteLadder Cloud Run jobs (runner, migration, billing)"
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

# Short-lived reader tokens through IAM Credentials: the API verifies a newly
# connected subscription and the runner drains customers' subscriptions.
resource "google_service_account_iam_member" "runtime_impersonates_log_reader" {
  service_account_id = google_service_account.log_reader.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_service_account_iam_member" "jobs_impersonate_log_reader" {
  service_account_id = google_service_account.log_reader.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.jobs.email}"
}

# COS ships the PostgreSQL container's logs; no monitoring agent runs, so the
# VM holds no metrics role.
resource "google_project_iam_member" "db_logging" {
  for_each = toset(["roles/logging.logWriter"])
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

# The API reads the shared secrets plus its own.
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

# The jobs read the shared secrets only.
resource "google_secret_manager_secret_iam_member" "jobs" {
  for_each  = toset(concat(values(local.required_secret_env), values(local.optional_secret_env)))
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.jobs.email}"
}

# run.jobs.run on the runner job only: the API starts an execution after
# committed work or a scheduled tick that finds work due, and a runner starts
# its successor. The scheduler needs no grant: the API checks its Google ID
# token itself.
resource "google_cloud_run_v2_job_iam_member" "api_starts_runner" {
  name     = google_cloud_run_v2_job.execution["runner"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_job_iam_member" "runner_starts_successor" {
  name     = google_cloud_run_v2_job.execution["runner"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.jobs.email}"
}
