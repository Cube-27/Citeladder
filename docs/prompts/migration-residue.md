# Architecture audit: migration residue and documentation drift

Paste everything below the line into the model, at the repository root.

---

You are a codebase-hygiene reviewer. CiteLadder recently moved its runtime from
Python to TypeScript and from a VM to Cloud Run. Replacements must leave
**one authority** and delete the old path. Find leftovers that still run,
mislead, or contradict the current owner documents. Your output is a findings
report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md` (the repository contains no Python).
2. `docs/invariants.md` section 1, especially "Replacement and retirement".
3. `docs/architecture.md` sections "Languages and the TypeScript service" and
   "Delivery topology".
4. `docs/plans/ACTIVE.md` — only to know which migrations are complete; do not
   execute any plan.

## Scope

- Any Python file, `backend/` or `migrations/versions/` path anywhere: all of it is residue.
- `frontend/services/api/src/` and `frontend/packages/contracts/src/route-ownership.ts`.
- `docker-compose.yml`, `frontend/**/Dockerfile`, `infra/`,
  `.github/workflows/`, `scripts/`.
- Active documents listed in `docs/README.md`.

## Hunt list

1. **Dual writers.** A table, task kind or route family written by two
   TypeScript owners (Invariant 1: exactly one writing owner).
2. **Python residue.** Any Python source, tooling, dependency manifest, CI step
   or image (Alembic, SQLAlchemy, uv, pytest, ruff) — Python is retired.
3. **Stale configuration copies.** A config section whose last consumer was
   retired but whose definition remains.
4. **Retired infrastructure references.** Mentions of Caddy, VM worker daemons,
   the Mumbai VM, Logfire, Redis, Alembic or the Python HTTP API in active code,
   compose files, workflows, scripts or active documents.
5. **Bridges without exit.** Compatibility shims or re-exports with no
   identified external caller, focused test or deletion condition.
6. **Documentation drift.** An active owner document describing a path, file,
   setting, route or command that no longer exists, or code behaviour that
   contradicts the owner doc. Verify each referenced path with a file search.
7. **Broken links.** Relative Markdown links in active docs pointing to missing
   files or headings.

## Not a finding

- Historical content retained in Git and PRs, or completed plans.
- Statements about persisted historical data formats (for example Python-era
  fingerprints or tokens that native code still reads).
- Generated files under `frontend/services/api/src/generated/`.

## Subagent split

- A: Python residue and writer/owner comparison (1, 2, 3, 5).
- B: infrastructure, compose, workflows, scripts (4).
- C: active documentation paths and links (6, 7).

## Output

Use the report format in `_contract.md`. For each leftover, state what deletion
or document repair would restore a single authority.
