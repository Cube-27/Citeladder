locals {
  migrate_script = <<-EOT
    set -e
    # The database VM may still be initializing on a fresh or replaced disk.
    python - <<'PY'
    import os, socket, time, urllib.parse
    url = urllib.parse.urlsplit(os.environ["DATABASE_URL"])
    deadline = time.monotonic() + 300
    while True:
        try:
            socket.create_connection((url.hostname, url.port or 5432), 3).close()
            break
        except OSError:
            if time.monotonic() > deadline:
                raise
            time.sleep(5)
    PY
    # Alembic drift admission, then native identity/grants/catalog bootstrap.
    # Any failure prevents the API rollout; the job can be retried idempotently.
    exec /bin/sh /app/bootstrap-environment.sh
  EOT
}

resource "google_cloud_run_v2_service" "api" {
  name                 = "${local.name}-api"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = false
  invoker_iam_disabled = true # Admission is the Workers' origin token, checked by the API.
  labels               = local.labels

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "300s"
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
        for_each = merge(local.shared_env, { CLOUD_RUN_RUNNER_JOB = local.runner_job })
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

      # Every HTTP path requires the origin token, so readiness is a TCP probe.
      startup_probe {
        tcp_socket {
          port = 8100
        }
        period_seconds    = 3
        failure_threshold = 20
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime]
}

resource "google_cloud_run_v2_job" "execution" {
  for_each = {
    runner = { args = ["src/runner.ts"], memory = "1Gi" }
    tick   = { args = ["src/tick.ts"], memory = "1Gi" }
  }

  name                = "${local.name}-${each.key}"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0
      # Admission stops at the budget; claimed work then finishes before exit.
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
          for_each = local.shared_env
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

  depends_on = [google_secret_manager_secret_iam_member.runtime]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name}-migrate"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    task_count = 1

    template {
      service_account = google_service_account.runtime.email
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
        image   = var.migrate_image
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

  # Targeting this job in the deploy also converges the database it migrates.
  depends_on = [
    google_secret_manager_secret_iam_member.runtime,
    google_compute_instance.db,
    google_compute_firewall.postgres,
  ]
}

# One periodic tick: lease recovery, due schedules, sync dispatch, then drain.
resource "google_cloud_scheduler_job" "tick" {
  name             = "${local.name}-tick"
  region           = var.region
  schedule         = var.tick_schedule
  time_zone        = "Etc/UTC"
  attempt_deadline = "30s"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.execution["tick"].id}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_starts_tick]
}
