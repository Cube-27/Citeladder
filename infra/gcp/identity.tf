resource "google_service_account" "db" {
  account_id                   = "${local.name}-db"
  display_name                 = "CiteLadder PostgreSQL VM"
  create_ignore_already_exists = true
}

removed {
  from = google_project_iam_member.db_logging

  lifecycle {
    destroy = false
  }
}

resource "google_service_account" "runtime" {
  account_id   = "${local.name}-runtime"
  display_name = "CiteLadder Cloud Run API"
}

resource "google_service_account" "jobs" {
  account_id   = "${local.name}-jobs"
  display_name = "CiteLadder Cloud Run jobs (runner, billing)"
}

resource "google_service_account" "migrate" {
  account_id   = "${local.name}-migrate"
  display_name = "CiteLadder schema migration job"
}

resource "google_service_account" "scheduler" {
  account_id   = "${local.name}-scheduler"
  display_name = "CiteLadder tick scheduler"
}

resource "google_service_account" "log_reader" {
  account_id   = "${local.name}-log-reader"
  display_name = "CiteLadder crawl-log reader (customer Pub/Sub subscriptions)"
}

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

resource "google_secret_manager_secret_iam_member" "jobs" {
  for_each  = toset(concat(values(local.required_secret_env), values(local.optional_secret_env)))
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.jobs.email}"
}

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
