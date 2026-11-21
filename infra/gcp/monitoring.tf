locals {
  api_host = trimprefix(google_cloud_run_v2_service.api.uri, "https://")
  alert_runbook = join("\n", [
    "Investigate with docs/operations/GCP_RUNBOOK.md.",
    "Logs: resource.type=(\"cloud_run_revision\" OR \"cloud_run_job\") AND severity>=WARNING.",
  ])
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "CiteLadder alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_uptime_check_config" "api_health" {
  display_name     = "${local.name}-api /health"
  timeout          = "30s"
  period           = "300s"
  selected_regions = ["USA_IOWA", "USA_OREGON", "USA_VIRGINIA"]

  http_check {
    path           = "/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.api_host
    }
  }
}

resource "google_monitoring_alert_policy" "api_down" {
  display_name          = "${local.name}-api /health failing"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Uptime check fails from more than one region"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.api_health.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.alert_runbook
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "api_5xx" {
  display_name          = "${local.name}-api server errors"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "API 5xx responses in five minutes"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.alert_runbook
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "job_failures" {
  display_name          = "${local.name} job execution failed"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Failed Cloud Run job executions"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/job/completed_execution_count\" AND resource.type=\"cloud_run_job\" AND metric.label.result=\"failed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.job_name"]
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.alert_runbook
    mime_type = "text/markdown"
  }
}

resource "google_logging_metric" "webhook_quarantined" {
  name        = "${local.name}_billing_webhook_quarantined"
  description = "Billing webhook events that entered quarantine (billing/webhooks.ts)."
  filter      = "jsonPayload.event=\"billing.webhook_quarantined\" AND severity=ERROR"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# A condition on a log-based metric must name one resource type. Webhook
# delivery and the scheduled tick log from the API service; the runner job's
# billing lane logs from the job.
resource "google_monitoring_alert_policy" "webhook_quarantined" {
  display_name          = "${local.name} billing webhook quarantined"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  dynamic "conditions" {
    for_each = { api = "cloud_run_revision", runner = "cloud_run_job" }
    content {
      display_name = "A billing webhook event entered quarantine (${conditions.key})"
      condition_threshold {
        filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.webhook_quarantined.name}\" AND resource.type=\"${conditions.value}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 0
        duration        = "0s"
        aggregations {
          alignment_period     = "300s"
          per_series_aligner   = "ALIGN_SUM"
          cross_series_reducer = "REDUCE_SUM"
        }
        trigger {
          count = 1
        }
      }
    }
  }

  documentation {
    content   = "A quarantined billing webhook is never applied automatically. Find the billing_webhook_events row by jsonPayload.webhook_event_id and read its error_code, then follow the reconciliation section of docs/operations/billing-operator-guide.md."
    mime_type = "text/markdown"
  }
}

# The VM's Container-Optimized OS reports no guest disk metric, so the
# periodic tick logs pg_database_size (db/database.ts); 1 GB buckets.
resource "google_logging_metric" "database_size" {
  name            = "${local.name}_database_size_bytes"
  description     = "PostgreSQL database size reported by each periodic tick."
  filter          = "jsonPayload.event=\"database_size_observed\" AND jsonPayload.logger=\"db\""
  value_extractor = "EXTRACT(jsonPayload.size_bytes)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "By"
  }
  bucket_options {
    linear_buckets {
      num_finite_buckets = 32
      width              = 1073741824
      offset             = 0
    }
  }
}

resource "google_monitoring_alert_policy" "database_size" {
  display_name          = "${local.name} database disk usage"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Database larger than ${var.database_size_alert_gb} GB of the 30 GB disk"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.database_size.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.database_size_alert_gb * 1073741824
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "No backups are kept and the data lives on the VM's 30 GB boot disk. Find the largest tables through the break-glass database shell (docs/operations/GCP_RUNBOOK.md) before the disk fills."
    mime_type = "text/markdown"
  }
}
