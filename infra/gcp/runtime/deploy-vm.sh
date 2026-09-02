#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:?REGION is required}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${DOMAIN_NAME:?DOMAIN_NAME is required}"
: "${SOURCE_COMMIT:?SOURCE_COMMIT is required}"
: "${DEFAULT_AGENT_BASE_URL:?DEFAULT_AGENT_BASE_URL is required}"
: "${DEFAULT_AGENT_MODEL:?DEFAULT_AGENT_MODEL is required}"
: "${CONTENT_PROVIDER:?CONTENT_PROVIDER is required}"
: "${CONTENT_PROVIDER_ENDPOINT:?CONTENT_PROVIDER_ENDPOINT is required}"
: "${CONTENT_MODEL:?CONTENT_MODEL is required}"

[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]
[[ "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]]
[[ "$DOMAIN_NAME" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]
[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]]
[[ "$BACKEND_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]]
[[ "$FRONTEND_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]]
expected_registry="${REGION}-docker.pkg.dev/${PROJECT_ID}/citeladder-demo"
[[ "$BACKEND_IMAGE" == "$expected_registry/backend@sha256:"* ]]
[[ "$FRONTEND_IMAGE" == "$expected_registry/frontend@sha256:"* ]]

had_previous=false
running_services=""
if test -f /opt/citeladder/runtime.env && test -f /opt/citeladder/compose.gcp.yml; then
  running_services="$(docker compose --env-file /opt/citeladder/runtime.env \
    -f /opt/citeladder/compose.gcp.yml ps --status running --quiet)"
fi
if [[ -n "$running_services" ]]; then
  cp /opt/citeladder/runtime.env /opt/citeladder/runtime.env.previous
  had_previous=true
fi

# Remove the retired inactivity shutdown from hosts deployed by older revisions.
systemctl disable --now citeladder-idle.timer 2>/dev/null || true
rm -f /etc/systemd/system/citeladder-idle.timer \
  /etc/systemd/system/citeladder-idle.service \
  /opt/citeladder/idle-shutdown.sh \
  /opt/citeladder/activity-start

install -d -m 0750 /opt/citeladder /opt/citeladder/tls
install -m 0644 /tmp/citeladder-deploy/compose.gcp.yml /opt/citeladder/compose.gcp.yml
install -m 0755 /tmp/citeladder-deploy/init-postgres-tls.sh /opt/citeladder/init-postgres-tls.sh
install -m 0750 /tmp/citeladder-deploy/backup.sh /opt/citeladder/backup.sh
install -m 0750 /tmp/citeladder-deploy/expire.sh /opt/citeladder/expire.sh

expiry="$(curl --fail --silent --show-error -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/demo-expires-at)"
test "$(date -u +%s)" -lt "$(date -u -d "$expiry" +%s)" || { echo 'Demo has expired'; exit 1; }

test -s /tmp/citeladder-deploy/cf-v4
test -s /tmp/citeladder-deploy/cf-v6
if grep -Fxq '0.0.0.0/0' /tmp/citeladder-deploy/cf-v4; then exit 1; fi
if grep -Fxq '::/0' /tmp/citeladder-deploy/cf-v6; then exit 1; fi
cloudflare_ipv4_space="$(paste -sd' ' /tmp/citeladder-deploy/cf-v4)"
cloudflare_ipv6_space="$(paste -sd' ' /tmp/citeladder-deploy/cf-v6)"
cloudflare_cidrs="$cloudflare_ipv4_space $cloudflare_ipv6_space"
sed -e "s/__DOMAIN_NAME__/$DOMAIN_NAME/g" \
  -e "s|__CLOUDFLARE_CIDRS__|$cloudflare_cidrs|g" \
  /tmp/citeladder-deploy/Caddyfile > /opt/citeladder/Caddyfile

secret() {
  gcloud secrets versions access latest --project "$PROJECT_ID" --secret "$1"
}
db_password="$(secret citeladder-db-password)"
jwt_secret="$(secret citeladder-jwt-secret)"
encryption_key="$(secret citeladder-encryption-key)"
referral_salt="$(secret citeladder-referral-salt)"
demo_password="$(secret citeladder-demo-password)"
origin_cert="$(secret citeladder-cloudflare-origin-cert)"
origin_key="$(secret citeladder-cloudflare-origin-key)"
agent_key="$(secret citeladder-default-agent-api-key 2>/dev/null || true)"
content_key="$(secret citeladder-content-api-key 2>/dev/null || true)"
keenable_key="$(secret citeladder-keenable-api-key 2>/dev/null || true)"
tavily_key="$(secret citeladder-tavily-api-key 2>/dev/null || true)"

for value in "$db_password" "$jwt_secret" "$encryption_key" "$referral_salt" "$demo_password"; do
  test "${#value}" -ge 32
done

write_env() {
  local name="$1" value="$2"
  case "$value" in
    *$'\n'*|*$'\r'*|*"'"*) echo "Invalid runtime.env value for $name" >&2; exit 1 ;;
  esac
  printf "%s='%s'\n" "$name" "$value"
}

cloudflare_ipv4="$(paste -sd, /tmp/citeladder-deploy/cf-v4)"
cloudflare_ipv6="$(paste -sd, /tmp/citeladder-deploy/cf-v6)"
trusted_proxy_cidrs="127.0.0.1/32,$cloudflare_ipv4,$cloudflare_ipv6"
db_password_uri="$(DB_PASSWORD="$db_password" python3 -c \
  'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')"
database_url="postgresql+asyncpg://citeladder:$db_password_uri@127.0.0.1:5432/citeladder"

umask 077
printf '%s\n' "$origin_cert" > /opt/citeladder/tls/origin.crt
printf '%s\n' "$origin_key" > /opt/citeladder/tls/origin.key
{
  write_env PROJECT_ID "$PROJECT_ID"
  write_env REGION "$REGION"
  write_env BACKEND_IMAGE "$BACKEND_IMAGE"
  write_env FRONTEND_IMAGE "$FRONTEND_IMAGE"
  write_env BACKUP_BUCKET "$BACKUP_BUCKET"
  write_env DOMAIN_NAME "$DOMAIN_NAME"
  write_env SOURCE_COMMIT "$SOURCE_COMMIT"
  write_env TRUSTED_PROXY_CIDRS "$trusted_proxy_cidrs"
  write_env DEMO_EXPIRES_AT "$expiry"
  write_env DEV_LOGIN_EMAIL "${DEV_LOGIN_EMAIL:-dev@citeladder.com}"
  write_env POSTGRES_PASSWORD "$db_password"
  write_env DATABASE_URL "$database_url"
  write_env JWT_SECRET_KEY "$jwt_secret"
  write_env ENCRYPTION_KEY "$encryption_key"
  write_env REFERRAL_HASH_SALT "$referral_salt"
  write_env DEV_LOGIN_PASSWORD "$demo_password"
  test -z "$content_key" || write_env CONTENT_API_KEY "$content_key"
  write_env CONTENT_PROVIDER "$CONTENT_PROVIDER"
  write_env CONTENT_PROVIDER_ENDPOINT "$CONTENT_PROVIDER_ENDPOINT"
  write_env CONTENT_MODEL "$CONTENT_MODEL"
  test -z "$agent_key" || write_env DEFAULT_AGENT_API_KEY "$agent_key"
  write_env DEFAULT_AGENT_BASE_URL "$DEFAULT_AGENT_BASE_URL"
  write_env DEFAULT_AGENT_MODEL "$DEFAULT_AGENT_MODEL"
  test -z "$keenable_key" || write_env KEENABLE_API_KEY "$keenable_key"
  test -z "$tavily_key" || write_env TAVILY_API_KEY "$tavily_key"
} > /opt/citeladder/runtime.env.new
mv /opt/citeladder/runtime.env.new /opt/citeladder/runtime.env

cd /opt/citeladder
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
stopped_services=(caddy frontend web audit-worker audit-scheduler site-health-worker \
  brand-discovery-worker content-worker agent-worker analytics-worker \
  queue-sweeper integration-worker integration-dispatcher)
restore_previous_deployment() {
  local status=$?
  trap - ERR
  set +e
  if $had_previous; then
    echo 'Deployment failed; restoring the previous runtime and services' >&2
    cp runtime.env.previous runtime.env
    docker compose --env-file runtime.env -f compose.gcp.yml up -d --force-recreate
  fi
  exit "$status"
}
trap restore_previous_deployment ERR

if $had_previous; then
  docker compose --env-file runtime.env -f compose.gcp.yml stop "${stopped_services[@]}"
  ./backup.sh predeploy
fi
docker compose --env-file runtime.env -f compose.gcp.yml pull
docker compose --env-file runtime.env -f compose.gcp.yml up -d --force-recreate

calendar="$(date -u -d "$expiry" '+%Y-%m-%d %H:%M:%S UTC')"
cat > /etc/systemd/system/citeladder-expiry.service <<'UNIT'
[Unit]
Description=Expire the CiteLadder temporary demo
[Service]
Type=oneshot
ExecStart=/opt/citeladder/expire.sh
UNIT
cat > /etc/systemd/system/citeladder-expiry.timer <<UNIT
[Unit]
Description=Stop CiteLadder at its fixed deadline
[Timer]
OnCalendar=$calendar
Persistent=true
AccuracySec=1min
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/citeladder-backup.service <<'UNIT'
[Unit]
Description=Back up the CiteLadder demo database
[Service]
Type=oneshot
ExecStart=/opt/citeladder/backup.sh nightly
UNIT
cat > /etc/systemd/system/citeladder-backup.timer <<'UNIT'
[Unit]
Description=Nightly CiteLadder database backup
[Timer]
OnCalendar=*-*-* 19:30:00 UTC
Persistent=true
RandomizedDelaySec=15m
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now citeladder-expiry.timer citeladder-backup.timer

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then break; fi
  echo "Health probe attempt $attempt failed"
  sleep 5
done
curl --fail --silent http://127.0.0.1:3000/health >/dev/null
for service in "${stopped_services[@]}" db; do
  container_id="$(docker compose --env-file runtime.env -f compose.gcp.yml ps -q "$service")"
  test -n "$container_id"
  test "$(docker inspect --format '{{.State.Running}}' "$container_id")" = true
  test "$(docker inspect --format '{{.RestartCount}}' "$container_id")" = 0
done
migrate_id="$(docker compose --env-file runtime.env -f compose.gcp.yml ps -aq migrate)"
test -n "$migrate_id"
test "$(docker inspect --format '{{.State.ExitCode}}' "$migrate_id")" = 0
rm -f runtime.env.previous
trap - ERR
