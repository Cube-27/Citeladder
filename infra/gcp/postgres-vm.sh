#!/bin/bash
# Container-Optimized OS startup script (Terraform template): runs on every
# boot and converges the single PostgreSQL container. Idempotent by design.
set -euo pipefail

image='${postgres_image}'
state=/mnt/stateful_partition/citeladder
config=$state/config
export HOME=/var/lib/citeladder
export DOCKER_CONFIG=$HOME/docker
install -d -m 0700 "$HOME" "$DOCKER_CONFIG" "$state" "$config"

# New IAM grants can take minutes to propagate after a fresh create.
retry() {
  for attempt in $(seq 1 30); do
    "$@" && return 0
    echo "citeladder-db: attempt $attempt failed: $1"
    sleep 10
  done
  return 1
}

# A small swap file keeps PostgreSQL alive through short memory spikes on the
# 1 GB e2-micro. Some COS kernels refuse swap; the database still runs.
if ! grep -q "$state/swapfile" /proc/swaps; then
  if [ ! -f "$state/swapfile" ]; then
    fallocate -l 1G "$state/swapfile" && chmod 0600 "$state/swapfile" && mkswap "$state/swapfile" >/dev/null
  fi
  swapon "$state/swapfile" || echo 'citeladder-db: swap unavailable on this kernel'
fi

# Private Google Access: metadata token -> Secret Manager -> password file.
read_password() {
  local token
  token=$(curl --fail --silent --show-error -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' |
    sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p')
  test -n "$token" || return 1
  curl --fail --silent --show-error -H "Authorization: Bearer $token" \
    'https://secretmanager.googleapis.com/v1/projects/${project_id}/secrets/citeladder-db-password/versions/latest:access' |
    tr -d '\n ' | sed -n 's/.*"data":"\([^"]*\)".*/\1/p' | base64 -d > "$config/db-password.new"
  test -s "$config/db-password.new"
}
umask 077
retry read_password
mv "$config/db-password.new" "$config/db-password"

docker-credential-gcr configure-docker --registries='${registry_host}' >/dev/null
retry docker pull "$image" >/dev/null

# PostgreSQL in the image runs as uid/gid 999. The certificate only encrypts
# private VPC traffic; clients use sslmode=require without verification.
if [ ! -s "$config/server.key" ]; then
  docker run --rm --entrypoint openssl -v "$config:/out" "$image" \
    req -new -x509 -nodes -days 3650 -subj '/CN=citeladder-db' \
    -keyout /out/server.key -out /out/server.crt 2>/dev/null
fi
chown 999:999 "$config/server.key" "$config/server.crt" "$config/db-password"
chmod 0600 "$config/server.key" "$config/db-password"
chmod 0644 "$config/server.crt"
cat > "$config/pg_hba.conf" <<'HBA'
local     all         all                         scram-sha-256
host      all         all         127.0.0.1/32    scram-sha-256
hostssl   citeladder  citeladder  ${client_cidr}  scram-sha-256
HBA
chmod 0644 "$config/pg_hba.conf"

# The password only applies when the data directory is first initialized;
# a rotated secret also needs ALTER ROLE (see the GCP runbook).
current=$(docker inspect --format '{{.Config.Image}}' citeladder-postgres 2>/dev/null || true)
if [ "$current" = "$image" ]; then
  docker start citeladder-postgres >/dev/null
  exit 0
fi
docker rm --force citeladder-postgres >/dev/null 2>&1 || true
docker run --detach --name citeladder-postgres --restart unless-stopped --network host \
  --shm-size 128m \
  -e POSTGRES_DB=citeladder -e POSTGRES_USER=citeladder \
  -e POSTGRES_PASSWORD_FILE=/run/citeladder/db-password \
  -e POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 \
  -v "$state/pgdata:/var/lib/postgresql/data" \
  -v "$config:/run/citeladder:ro" \
  "$image" postgres \
  -c listen_addresses='127.0.0.1,${db_address}' \
  -c hba_file=/run/citeladder/pg_hba.conf \
  -c ssl=on -c ssl_cert_file=/run/citeladder/server.crt -c ssl_key_file=/run/citeladder/server.key \
  -c password_encryption=scram-sha-256 \
  -c max_connections=40 -c shared_buffers=128MB -c effective_cache_size=384MB \
  -c work_mem=4MB -c maintenance_work_mem=64MB >/dev/null
