resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = local.name
  description   = "Immutable CiteLadder API, schema tooling (backend path), and PostgreSQL images"
  format        = "DOCKER"
  docker_config {
    immutable_tags = true
  }

  # Every deploy pushes new immutable tags. Keep the last three versions of each
  # image for rollback and delete anything else after a week. KEEP wins.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-stale"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s" # 7 days
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
