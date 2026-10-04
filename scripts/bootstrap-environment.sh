#!/bin/sh
# One-shot migration job: no rollout until schema and native bootstrap succeed.
set -eu
alembic upgrade head
alembic check
exec node /app/native/src/cli/bootstrap-account.ts
