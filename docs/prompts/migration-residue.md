# Architecture audit: migration residue and documentation drift

Paste everything below the line into the model, at the repository root.

---

You are a codebase-hygiene reviewer. CiteLadder recently moved its runtime from
Python to TypeScript and from a VM to Cloud Run. Replacements must leave
**one authority** and delete the old path. Find leftovers that still run,
mislead, or contradict the current owner documents. Your output is a findings
report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md` (Python models/Alembic/operators are intentional).
2. `docs/invariants.md` section 1, especially "Replacement and retirement".
3. `docs/architecture.md` sections "Languages and the TypeScript service" and
   "Delivery topology".
4. `docs/plans/ACTIVE.md` — only to know which migrations are complete; do not
   execute any plan.

## Scope

- `backend/app/` and `backend/scripts/` (what Python still owns vs what moved).
- `frontend/services/api/src/` and `frontend/packages/contracts/src/route-ownership.ts`.
- `docker-compose.yml`, `Dockerfile`, `frontend/**/Dockerfile`, `infra/`,
  `.github/workflows/`, `scripts/`.
- Active documents listed in `docs/README.md` (not `docs/archive/`).

## Hunt list

1. **Dual writers.** A table, task kind or route family written by both a
   Python module and a TypeScript module (Invariant 1: exactly one writing
   stack). Compare Python `session.add`/`insert`/`update` sites against
   TypeScript writers for the same table.
2. **Orphaned Python runtime.** Python domain services, connectors or workers
   that no supported operator, bootstrap, migration or test imports any more,
   yet still exist (dead behaviour that looks authoritative).
3. **Stale configuration copies.** A Python config section whose last consumer
   moved to TypeScript but whose definition and exporter builder remain
   (backend-architecture: moving a policy section removes its Python
   definition and exporter builder).
4. **Retired infrastructure references.** Mentions of Caddy, VM worker daemons,
   the Mumbai VM, Logfire, Redis or the Python HTTP API in active code,
   compose files, workflows, scripts or active documents.
5. **Bridges without exit.** Compatibility shims or re-exports with no
   identified external caller, focused test or deletion condition.
6. **Documentation drift.** An active owner document describing a path, file,
   setting, route or command that no longer exists, or code behaviour that
   contradicts the owner doc. Verify each referenced path with a file search.
7. **Broken links.** Relative Markdown links in active docs pointing to missing
   files or headings.

## Not a finding

- Historical content inside `docs/archive/` or completed plans.
- SQLAlchemy models, Alembic, bootstrap and supported operators in Python.
- Generated files under `frontend/services/api/src/generated/`.

## Subagent split

- A: Python ↔ TypeScript writer and owner comparison (1, 2, 3, 5).
- B: infrastructure, compose, workflows, scripts (4).
- C: active documentation paths and links (6, 7).

## Output

Use the report format in `_contract.md`. For each leftover, state what deletion
or document repair would restore a single authority.
