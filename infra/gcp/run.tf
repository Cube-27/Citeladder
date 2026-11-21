locals {
  migrate_script = "node src/cli/migrate.ts --wait-seconds 300 && exec node src/cli/bootstrap-account.ts"
}

resource "google_cloud_run_v2_service" "api" {
  name                 = "${local.name}-api"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = false
  invoker_iam_disabled = true
  labels               = local.labels

  template {
    service_account = google_service_account.runtime.email
    timeout                          = "1860s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8100
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = merge(local.shared_env, {
          CLOUD_RUN_RUNNER_JOB    = local.runner_job
          SCHEDULER_TICK_INVOKER  = google_service_account.scheduler.email
          SCHEDULER_TICK_AUDIENCE = local.tick_audience
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = merge(local.shared_secret_env, local.api_only_secret_env)
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        tcp_socket {
          port = 8100
        }
        period_seconds    = 3
        failure_threshold = 20
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8100
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [traffic]
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime]
}

resource "google_cloud_run_v2_job" "execution" {
  for_each = {
    runner = { args = ["src/runner.ts"], memory = "1Gi" }
    billing = { args = ["src/cli/billing-admin.ts", "--help"], memory = "512Mi" }
  }

  name                = "${local.name}-${each.key}"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.jobs.email
      max_retries     = 0
      timeout = "${var.runner_budget_seconds + 600}s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.main.id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image   = var.api_image
        command = ["node"]
        args    = each.value.args

        resources {
          limits = {
            cpu    = "1"
            memory = each.value.memory
          }
        }

        dynamic "env" {
          for_each = merge(local.shared_env, { CLOUD_RUN_RUNNER_JOB = local.runner_job })
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = local.shared_secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.jobs]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name}-migrate"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    task_count = 1

    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "900s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.main.id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image   = var.api_image
        command = ["/bin/sh", "-c"]
        args    = [local.migrate_script]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        dynamic "env" {
          for_each = local.shared_env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = merge(local.shared_secret_env, local.migration_secret_env)
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.migrate,
    google_compute_instance.db,
    google_compute_firewall.postgres,
  ]
}

resource "google_cloud_scheduler_job" "tick" {
  name             = "${local.name}-tick"
  region           = var.region
  schedule         = var.tick_schedule
  time_zone        = "Etc/UTC"
  attempt_deadline = "60s"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/internal/tick"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = local.tick_audience
    }
  }
}
