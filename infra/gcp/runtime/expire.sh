#!/usr/bin/env bash
set -euo pipefail

(cd /opt/citeladder && \
  docker compose --env-file runtime.env -f compose.gcp.yml down --timeout 30) || true
shutdown -h now
