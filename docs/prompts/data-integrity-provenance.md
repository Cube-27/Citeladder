# Data audit: evidence immutability, provenance and schema

Paste everything below the line into the model, at the repository root.

---

You are a data-integrity reviewer. CiteLadder's credibility depends on raw
evidence never being rewritten and every derived number pointing at the exact
evidence and processing versions that produced it. Your output is a findings
report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/invariants.md` sections 4, 5, 6 (measurement comparison paragraph),
   12 and 17.
3. `docs/architecture.md` section "Evidence and action flow".

## Scope

- Schema: `frontend/services/api/migrations/0001_baseline.sql` (the only schema author).
- Generated types: `frontend/services/api/src/generated/db-schema.ts`.
- Writers in `frontend/services/api/src/`: search for `insertInto`,
  `updateTable`, `deleteFrom` and list which tables each touches.

## Hunt list

1. **Mutated evidence.** `updateTable`/`deleteFrom` on raw evidence or attempt
   tables (crawl fetches, page snapshots, answer-engine answers, provider/model
   attempts, integration observations, billing receipts/ledger, grants). Build
   the list of append-only tables from the invariants and owner docs first,
   then search for writes to them. Status/lease columns on queue rows are
   allowed to change; evidence payload columns are not.
2. **Missing provenance.** Derived rows (analyses, scores, opportunities,
   briefs, verifications, agent outputs, demand signals) inserted without the
   source IDs and extractor/classifier/model/template versions that their
   columns or the owner doc require. Look for columns that exist in the schema
   but are written as `null` or a literal.
3. **Provenance not checked on comparison.** Code comparing two measurements
   (period-over-period, before/after verification) without checking that
   versions and composition are compatible (Invariant 6, measurement paragraph).
4. **Schema integrity.** Foreign keys missing `ON DELETE` behaviour consistent
   with ownership (orphans after project deletion, or cascades that delete
   evidence another workspace object references); missing `NOT NULL` on
   `workspace_id`; missing unique constraints that the code's idempotency
   relies on; enum/check constraints narrower or wider than the TypeScript union.
5. **Generated type drift.** Columns in `db-schema.ts` that do not match
   `0001_baseline.sql` (types, nullability) — indicates stale generation.
6. **Second schema author.** Any DDL (`CREATE`, `ALTER`, `sql\`create …\``) in
   TypeScript, or a migration file other than `0001_baseline.sql` (Invariant 17).
7. **Generated content becoming fact.** Model output written into a table or
   column the product treats as confirmed fact (company facts, competitors,
   prices) without an explicit user confirmation step (Invariant 12).
8. **Soft deletes and history.** Delete paths that remove evidence needed by a
   persisted derived result, breaking its provenance chain.

## Not a finding

- Absence of `0002+` migrations; a semantic version bumped once for a release.
- Updates to lifecycle/status/lease columns on task and queue rows.

## Subagent split

- A: build the append-only table list, then search writers (items 1, 8).
- B: derived-row inserts and comparisons (2, 3, 7).
- C: schema vs generated types vs constraints (4, 5, 6).

## Output

Use the report format in `_contract.md`. For schema findings quote both the DDL
and the code that relies on it.
