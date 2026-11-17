# bootstrap.mjs creates this account first and grants its only project role
# (logging.logWriter): the deployer cannot edit project IAM.
resource "google_service_account" "db" {
  account_id                   = "${local.name}-db"
  display_name                 = "CiteLadder PostgreSQL VM"
  create_ignore_already_exists = true
}

# The log-writer grant moved to bootstrap.mjs; forget it without revoking it.
removed {
  from = google_project_iam_member.db_logging

  lifecycle {
    destroy = false
  }
}

# The API service; alone reads the Worker origin tokens and the Turnstile
# secret. Its account ID predates the separate job identity: the jobs moved
# off it, so the serving API never loses a grant during the cutover.
resource "google_service_account" "runtime" {
  account_id   = "${local.name}-runtime"
  display_name = "CiteLadder Cloud Run API"
}

# The runner and billing jobs.
resource "google_service_account" "jobs" {
  account_id   = "${local.name}-jobs"
  display_name = "CiteLadder Cloud Run jobs (runner, billing)"
}

# The migrate job alone reads the schema owner's database URL.
resource "google_service_account" "migrate" {
  account_id   = "${local.name}-migrate"
  display_name = "CiteLadder schema migration job"
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

# The migrate job reads the shared secrets plus the schema owner's URL.
resource "google_secret_manager_secret_iam_member" "migrate" {
  for_each = toset(concat(
    values(local.required_secret_env),
    values(local.optional_secret_env),
    values(local.migration_secret_env),
  ))
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrate.email}"
}

# The deploy workflow reads, adds, disables and destroys versions of the
# CiteLadder secrets only; its project role covers containers, not payloads.
resource "google_secret_manager_secret_iam_member" "deployer" {
  for_each = {
    for pair in setproduct(local.runtime_secret_ids, [
      "roles/secretmanager.secretAccessor",
      "roles/secretmanager.secretVersionManager",
    ]) : "${pair[0]} ${pair[1]}" => { secret = pair[0], role = pair[1] }
  }
  secret_id = google_secret_manager_secret.runtime[each.value.secret].secret_id
  role      = each.value.role
  member    = "serviceAccount:${var.deployer_service_account}"
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

# A runner hands over to its successor with an environment override
# (RUNNER_HANDOVER), which needs run.jobs.runWithOverrides.
resource "google_cloud_run_v2_job_iam_member" "runner_starts_successor" {
  name     = google_cloud_run_v2_job.execution["runner"].name
  location = var.region
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.jobs.email}"
}
