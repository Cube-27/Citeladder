---
name: local-env
description: Run CiteLadder locally with seeded data for manual, browser or design testing - start Postgres and the servers, seed or re-seed, demo accounts, routes and states - and where the production account scripts (dev@ operator, Kerry's team workspace) live. Use before any local browser check, seed change, design review, or after a production reset when accounts must be recreated.
---

# Local environment and accounts

The seed, its tooling and the production account scripts live in the git-ignored
`frontend/services/api/local/` of the **main checkout** (`~/projects/Citeladder`); worktrees don't have it.
`local/README.md` there is the reference: commands, demo accounts, workspace IDs, routes and how to reach
each state. Read the section you need; never print `local/env/secrets.json`.

## Serve and seed

1. `docker compose up -d db` from the repo root starts Postgres only (127.0.0.1:55432). Plain
   `docker compose up -d` also runs the `migrate` service (migrations, the dev login and the billing
   catalog), which a re-created database needs once before seeding.
2. From `frontend/services/api` in the main checkout:
   - `node local/seed.ts` completes the seed (idempotent); `--fresh` rebuilds it with current dates.
   - `node local/env/serve.mjs <checkout>` serves the API (8100) and app (3001) from any checkout or
     worktree, in a tmux window named `servers`; wait for `[serve] ready`.
3. Sign in at http://127.0.0.1:3001/login with a demo account from the README.

The servers and the seed run offline: `local/env/offline-guard.mjs` refuses every non-loopback socket and
the API gets no provider keys. Launching runs, crawls or Agent messages does nothing locally.

## Rules

- The local database is shared by every worktree and session: follow `validate-change`'s shared-database
  rule. A fresh seed changes IDs; regenerate the route list (`node local/env/route-urls.mjs >
  local/env/route-urls.txt`).
- When the schema baseline changes, the shared database needs re-creating before the seed runs; that is
  the owner's call while other sessions use it.

## Production accounts

After a production reset the accounts are recreated with `local/ops/provision-prod.mjs` (README,
"Production accounts"). When the owner asks, the agent runs these scripts and prod database queries itself
(`run-agents`, "Production").
