"""Shared HTTP API path configuration."""

from typing import Final

API_V1_PREFIX: Final = "/api/v1"

# Readiness probe budget. ``/ready`` answers "can this process serve?", so it
# must fail fast rather than hang a load balancer behind a slow or wedged
# database: a probe that blocks is indistinguishable from a probe that passes.
READINESS_TIMEOUT_SECONDS: Final = 2.0

# Listening port of the TypeScript API service (frontend/services/api), read
# through the generated export; a PORT environment value overrides it.
TS_API_SERVICE_PORT: Final = 8100
