resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "citeladder-demo"
  description   = "Immutable CiteLadder temporary-demo images"
  format        = "DOCKER"
  docker_config {
    immutable_tags = true
  }

  # Retention: every deploy pushes a new immutable tag, so without this the
  # repository grows without bound. KEEP policies win over DELETE policies.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-stale"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }

  labels = local.labels
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.runtime_secret_ids
  secret_id = each.value
  labels    = local.labels

  replication {
    auto {}
  }
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-citeladder-demo-backups"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true
  labels                      = local.labels

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 10
    }
    action {
      type = "Delete"
    }
  }
}
