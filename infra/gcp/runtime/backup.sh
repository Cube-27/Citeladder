#!/usr/bin/env bash
set -euo pipefail

mode="${1:-nightly}"
cd /opt/citeladder
set -a
# shellcheck source=/dev/null
. ./runtime.env
set +a
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$(mktemp --tmpdir citeladder-backup.XXXXXX.sql.gz)"
trap 'rm -f "$tmp"' EXIT
docker compose --env-file runtime.env -f compose.gcp.yml exec -T db \
  pg_dump -U citeladder -d citeladder | gzip -9 > "$tmp"
test -s "$tmp"
gcloud storage cp "$tmp" "gs://${BACKUP_BUCKET}/${mode}/${timestamp}.sql.gz" --quiet
