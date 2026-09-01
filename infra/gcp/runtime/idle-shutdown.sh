#!/usr/bin/env bash
set -euo pipefail

cd /opt/citeladder
set -a
# shellcheck source=/dev/null
. ./runtime.env
set +a

idle_seconds="${IDLE_SHUTDOWN_SECONDS:-600}"
[[ "$idle_seconds" =~ ^[0-9]+$ ]]
test "$idle_seconds" -ge 60

last_activity="$(python3 - <<'PY'
import gzip
import json
from pathlib import Path

root = Path("/opt/citeladder")
marker = root / "activity-start"
latest = int(marker.stat().st_mtime) if marker.exists() else 0
for path in (root / "logs").glob("access.log*"):
    opener = gzip.open if path.suffix == ".gz" else open
    try:
        with opener(path, "rt", encoding="utf-8", errors="replace") as stream:
            for line in stream:
                try:
                    record = json.loads(line)
                    uri = str(record.get("request", {}).get("uri", ""))
                    if uri.split("?", 1)[0] != "/health":
                        latest = max(latest, int(float(record.get("ts", 0))))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
    except OSError:
        continue
print(latest)
PY
)"
now="$(date -u +%s)"
if (( now - last_activity < idle_seconds )); then
  exit 0
fi

active_jobs="$(docker compose --env-file runtime.env -f compose.gcp.yml exec -T db \
  psql -U citeladder -d citeladder -tAc "
    SELECT
      (SELECT count(*) FROM audit_tasks WHERE status IN ('queued','leased','running','retry_wait','capacity_wait','pending_reservation')) +
      (SELECT count(*) FROM site_crawl_tasks WHERE status IN ('queued','leased','running','retry_wait','capacity_wait')) +
      (SELECT count(*) FROM content_generations WHERE status IN ('queued','leased','running','retry_wait','capacity_wait')) +
      (SELECT count(*) FROM brand_discovery_tasks WHERE status IN ('queued','leased','running','retry_wait','capacity_wait')) +
      (SELECT count(*) FROM integration_sync_runs WHERE status IN ('queued','leased','running','retry_wait','capacity_wait')) +
      (SELECT count(*) FROM analytics_tasks WHERE status IN ('queued','leased','running','retry_wait','capacity_wait')) +
      (SELECT count(*) FROM agent_task_runs WHERE status IN ('queued','leased','running','retry_wait','capacity_wait'));
  " | tr -d '[:space:]')"
[[ "$active_jobs" =~ ^[0-9]+$ ]]
if (( active_jobs > 0 )); then
  touch /opt/citeladder/activity-start
  exit 0
fi

shutdown -h now
