# Audit report cleanup plan

Source: [`../audits/audit-report.md`](../audits/audit-report.md)  
Status: implemented and verified on 2026-08-02

## Execution plan

1. Remove confirmed dead code and hoist the static engine-label constant.
2. Consolidate the duplicated traffic tables and auth form structure behind shared owners.
3. Decompose the marketing product scene into reusable frame primitives and data-driven rows.
4. Extract pure attribution aggregation/delta helpers and one evidence predicate.
5. Split crawl-finalize loading, rule evaluation, and persistence while preserving its lock and flush boundaries.
6. Split dashboard source fetching, section construction, and response assembly.
7. Run focused behavior tests, database-backed component tests, TypeScript, lint, and frontend policy guards.

## Acceptance criteria

- All nine audit actions are implemented, including the optional dashboard cleanup.
- Existing API/DTO output, UI copy, paging behavior, persistence ordering, and error handling remain unchanged.
- No migrations, configuration changes, or new runtime dependencies are introduced.
- Focused backend and frontend tests, type checking, lint, and architecture/design policy checks pass.
