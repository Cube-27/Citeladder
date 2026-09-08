#!/usr/bin/env bash
# Explicit operator-only rebuild of the installed pre-launch GCP database.
set -euo pipefail
expected_project="${1:?Explicit GCP project ID required}"
mode="${2:-preview}"
[[ "$expected_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]
[[ "$mode" = preview || "$mode" = reset ]]
cd /opt/citeladder
# Never print runtime.env: it contains credentials.
set -a
. ./runtime.env
set +a
test "$PROJECT_ID" = "$expected_project"
test "$DEMO_MODE" = false
compose=(docker compose --env-file runtime.env -f compose.gcp.yml)
db_id="$("${compose[@]}" ps -q db)"
test -n "$db_id"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d citeladder -c   'SELECT current_database(), (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM projects) AS projects, (SELECT count(*) FROM billing_subscriptions) AS subscriptions;'
printf 'Installed source commit: %s\n' "$SOURCE_COMMIT"
if test "$mode" = preview; then
  echo 'Preview only. Repeat --project as --reset-project to destroy and rebuild this database.'
  exit 0
fi
# Verify the installed images exist before taking the application offline.
docker image inspect "$BACKEND_IMAGE" "$FRONTEND_IMAGE" >/dev/null
services=()
while IFS= read -r service; do
  case "$service" in db|db-tls-init) ;; *) services+=("$service") ;; esac
done < <("${compose[@]}" config --services)
wait_for_health() {
  for attempt in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}
reset_started=false
recover_reset() {
  local failure=$?
  trap - ERR
  echo 'Reset failed; attempting one bounded recovery with the installed images.' >&2
  if test "$reset_started" = true; then
    # DROP may have succeeded before CREATE failed. Never drop again on recovery.
    if ! "${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d postgres <<'SQL'
SELECT 'CREATE DATABASE citeladder OWNER citeladder' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'citeladder')
\gexec
SQL
    then
      echo 'Could not restore the database container target; inspect PostgreSQL before retrying.' >&2
      exit "$failure"
    fi
    if
      ! "${compose[@]}" run --rm --no-deps migrate ||
      ! "${compose[@]}" run --rm --no-deps migrate alembic check; then
      echo 'Recovery could not establish a valid schema. Services remain stopped; repair the migration/bootstrap failure and rerun the reset command.' >&2
      exit "$failure"
    fi
  fi
  if "${compose[@]}" up -d && wait_for_health; then
    echo 'Application recovered. The original reset failure is reported by the exit status.' >&2
  else
    echo 'Application recovery failed; inspect docker compose service status and logs before retrying.' >&2
  fi
  exit "$failure"
}
trap recover_reset ERR
"${compose[@]}" stop "${services[@]}"
# Fixed database and role, never an interpolated SQL identifier or database URL.
reset_started=true
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d postgres   -c 'DROP DATABASE citeladder WITH (FORCE);'   -c 'CREATE DATABASE citeladder OWNER citeladder;'
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps migrate alembic check
"${compose[@]}" up -d
wait_for_health
trap - ERR
echo 'Database rebuilt, configured dev login provisioned, application healthy.'
