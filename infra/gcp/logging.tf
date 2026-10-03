# Origin-rejected requests can be flooded at the public Cloud Run URL.
# Retain application logs and all other request statuses for diagnostics.
resource "google_logging_project_exclusion" "api_forbidden_requests" {
  project     = var.project_id
  name        = "citeladder-api-forbidden-requests"
  description = "Exclude API HTTP 403 request logs to bound abuse-related ingestion."
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}-api\" AND log_id(\"run.googleapis.com/requests\") AND httpRequest.status=403"
  disabled    = false
}
