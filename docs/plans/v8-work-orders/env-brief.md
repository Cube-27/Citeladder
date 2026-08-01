# Environment brief — read before running any command

Repository: `/code/abhij1306/Searchify`
Branch: `vorflux/v8-cost-latency-tier-pricing-backend` (already checked out; base `main` @ `f049823`)

## Toolchain is already provisioned

- `uv` is at `~/.local/bin/uv`. **Every shell must start with**
  `export PATH="$HOME/.local/bin:$PATH"` or `uv` is not found.
- Backend deps are synced with the dev extra: `uv sync --extra dev` (note: `dev`
  is an `[project.optional-dependencies]` extra, NOT a dependency group, so
  plain `uv sync` and `uv sync --all-groups` do NOT install pytest/ruff).
- PostgreSQL 16 is installed and running via
  `sudo pg_ctlcluster 16 main start`. If a command reports the server is down,
  start it with that exact command. Password for `postgres` is
  `searchify_dev_password`.
- `/code/abhij1306/Searchify/.env` exists (gitignored) and contains only:
  `DATABASE_URL=postgresql+asyncpg://postgres:searchify_dev_password@localhost:5432/searchify`
  The test suite derives its throwaway `searchify_tests_<runid>` database from
  this. Do not commit `.env` and do not add secrets to it.
- The `searchify` dev database exists and is migrated to `0001_initial`.

## Verify commands (run from `backend/`)

```bash
export PATH="$HOME/.local/bin:$PATH"
uv run pytest tests/unit/test_<area>.py tests/component/test_<area>.py -q
uv run ruff check .
uv run python -m scripts.check_complexity      # complexity ratchet
```

Only on the schema-sync commit (commit 8):

```bash
uv run alembic upgrade head
uv run alembic check
```

`alembic check` emits a harmless `SAWarning` about unresolvable table cycles —
that is pre-existing and not a failure. Success looks like
`No new upgrade operations detected.`

## Baseline state confirmed green at branch point

`alembic upgrade head`, `alembic check`, `ruff check .` and
`python -m scripts.check_complexity` ("complexity ratchet ok (275 modules)") all
pass on `main` before any of this work. If one of these fails after your change,
it is your change.

## Rules that are non-negotiable

- Run `uv run python -m scripts.check_complexity` after **every** commit, not
  just at the end. `NEW_FUNCTION_CC_CEILING = 15`, and per-function budgets are
  frozen in `backend/scripts/complexity_baseline.json`. Functions this work
  touches are already at ceiling and cannot grow: `create_audit` 23,
  `_run_provider_call` 17, `apply_subscription_state` 15,
  `replace_monitored_set` 28.
- Config never lives in service code (invariant 1). Every threshold, model id,
  timeout, limit and price belongs in `app/core/config/*`.
- Never edit `migrations/versions/0001_initial.py` unless you are explicitly the
  commit-8 schema integrator. Feature commits change ORM models ONLY.
- Frontend is **pnpm only**, pinned `pnpm@11.9.0`. Never npm or yarn.
- Do not commit `/code/.plans/` or `/code/.session-history/` content into the
  repository. The only plan doc that belongs in the repo is
  `docs/plans/v8-pending-features.md`.

## If you hit a blocker

Stop and report back to the main agent with the specific blocker. Do not work
around a contract disagreement, do not weaken a fail-closed default, and do not
invent a measured number.
