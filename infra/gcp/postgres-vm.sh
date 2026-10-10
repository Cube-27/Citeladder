#!/bin/bash
# Container-Optimized OS startup script (Terraform template): runs on every
# boot and converges the single PostgreSQL container. Idempotent by design.
set -euo pipefail

image='${postgres_image}'
state=/mnt/stateful_partition/citeladder
config=$state/config
export HOME=/var/lib/citeladder
export DOCKER_CONFIG=$HOME/docker
install -d -m 0700 "$HOME" "$DOCKER_CONFIG" "$state"
# The image runs PostgreSQL as uid/gid 999, never root. It must traverse the
# mounted config directory; the secret files inside stay 0600 and owned by 999.
install -d -m 0755 "$config"
install -d -o 999 -g 999 -m 0700 "$state/pgdata"

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
  if [[ ! -f "$state/swapfile" ]]; then
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
  [[ -n "$token" ]] || return 1
  curl --fail --silent --show-error -H "Authorization: Bearer $token" \
    'https://secretmanager.googleapis.com/v1/projects/${project_id}/secrets/citeladder-db-password/versions/latest:access' |
    tr -d '\n ' | sed -n 's/.*"data":"\([^"]*\)".*/\1/p' | base64 -d > "$config/db-password.new"
  [[ -s "$config/db-password.new" ]]
}
# The COS host firewall drops inbound traffic other than SSH. PostgreSQL uses
# host networking, so open its port on the private address only.
iptables -C INPUT -p tcp -d '${db_address}' --dport 5432 -j ACCEPT 2>/dev/null ||
  iptables -I INPUT 1 -p tcp -d '${db_address}' --dport 5432 -j ACCEPT

umask 077
retry read_password
mv "$config/db-password.new" "$config/db-password"

docker-credential-gcr configure-docker --registries='${registry_host}' >/dev/null
retry docker pull "$image" >/dev/null

# The certificate only encrypts private VPC traffic; clients use
# sslmode=require without verification.
if [[ ! -s "$config/server.key" ]]; then
  docker run --rm --user 0:0 --entrypoint openssl -v "$config:/out" "$image" \
    req -new -x509 -nodes -days 3650 -subj '/CN=citeladder-db' \
    -keyout /out/server.key -out /out/server.crt 2>/dev/null
fi
chown 999:999 "$config/server.key" "$config/server.crt" "$config/db-password"
chmod 0600 "$config/server.key" "$config/db-password"
chmod 0644 "$config/server.crt"
# The socket exists only inside the container; boot uses it to apply the secret.
cat > "$config/pg_hba.conf" <<'HBA'
local     all         all                         trust
host      all         all         127.0.0.1/32    scram-sha-256
hostssl   citeladder  citeladder  ${client_cidr}  scram-sha-256
HBA
chmod 0644 "$config/pg_hba.conf"

run_args=(
  --detach --name citeladder-postgres --restart unless-stopped --network host --shm-size 128m
  -e POSTGRES_DB=citeladder -e POSTGRES_USER=citeladder
  -e POSTGRES_PASSWORD_FILE=/run/citeladder/db-password
  -e POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256
  -v "$state/pgdata:/var/lib/postgresql/data"
  -v "$config:/run/citeladder:ro"
  "$image" postgres
  -c 'listen_addresses=127.0.0.1,${db_address}'
  -c hba_file=/run/citeladder/pg_hba.conf
  -c ssl=on -c ssl_cert_file=/run/citeladder/server.crt -c ssl_key_file=/run/citeladder/server.key
  -c password_encryption=scram-sha-256
  -c max_connections=40 -c shared_buffers=128MB -c effective_cache_size=384MB
  -c work_mem=4MB -c maintenance_work_mem=64MB
  -c tcp_keepalives_idle=60 -c tcp_keepalives_interval=10 -c tcp_keepalives_count=6
)
# Recreate the container whenever its image, arguments or access rules change;
# the data directory persists. An unchanged specification only starts it.
spec=$({ printf '%s\n' "$${run_args[@]}"; cat "$config/pg_hba.conf"; } | sha256sum | cut -c1-16)
current=$(docker inspect --format '{{index .Config.Labels "citeladder.spec"}}' citeladder-postgres 2>/dev/null || true)
if [[ "$current" == "$spec" ]]; then
  docker start citeladder-postgres >/dev/null
else
  docker rm --force citeladder-postgres >/dev/null 2>&1 || true
  docker run --label "citeladder.spec=$spec" "$${run_args[@]}" >/dev/null
fi

# initdb reads the password only once. Apply the secret on every boot so a
# rotated value takes effect with a VM restart (see the GCP runbook).
for attempt in $(seq 1 60); do
  docker exec citeladder-postgres pg_isready -q -h 127.0.0.1 -U citeladder && break
  [[ "$attempt" -lt 60 ]] || exit 1
  sleep 2
done
# The value travels through the container-local environment, never argv or SQL logs.
docker exec -i citeladder-postgres sh -c \
  'ROLE_PASSWORD="$(cat /run/citeladder/db-password)" psql -q -v ON_ERROR_STOP=1 -U citeladder -d citeladder' \
  >/dev/null <<'SQL'
\getenv password ROLE_PASSWORD
ALTER ROLE citeladder PASSWORD :'password';
SQL
