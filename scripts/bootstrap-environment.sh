#!/bin/sh
# One-shot migration job: no rollout until both bootstrap owners succeed.
set -eu
alembic upgrade head
alembic check
python -m app.demo.bootstrap
exec node /app/native/src/cli/bootstrap-catalog.ts
