#!/usr/bin/env bash
# Suite D wrapper: grant the HARNESS USER's workspace the Starter capability,
# run the Starter e2e (sitemap ingestion + monitored set + finalize pass),
# then ALWAYS reset the entitlement back to free.
#
# DB access: psql "$PGURL" derived from DATABASE_URL (default below). Set
# SH_DB_CONTAINER to route through `docker exec <container> psql` instead.
# The workspace is resolved through workspace_members for the harness email
# (never "oldest workspace" — that grants the wrong tenant on a shared DB).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
EMAIL="${SH_HARNESS_EMAIL:-sh-p1-test@searchify.dev}"

SQL="SELECT wm.workspace_id FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE u.email = '$EMAIL'
     ORDER BY wm.created_at LIMIT 1"

if [ -n "${SH_DB_CONTAINER:-}" ]; then
  WS=$(docker exec "$SH_DB_CONTAINER" psql -U postgres -d searchify -tAc "$SQL")
else
  PGURL="${DATABASE_URL:-postgresql+asyncpg://postgres:postgres@localhost:5432/searchify}"
  PGURL="${PGURL/postgresql+asyncpg/postgresql}"
  WS=$(psql "$PGURL" -tAc "$SQL")
fi
WS=$(echo "$WS" | tr -d '[:space:]')
if [ -z "$WS" ]; then
  echo "error: no workspace found for harness user $EMAIL (run sh-seed.sh first)" >&2
  exit 1
fi
echo "workspace: $WS (user $EMAIL)"

cd "$REPO/backend"
reset() { uv run python -m scripts.set_site_health_entitlement "$WS" free; }
trap reset EXIT
uv run python -m scripts.set_site_health_entitlement "$WS" starter
uv run python "$HERE/sh-p2-e2e-starter.py"
