# Backend audit: query and runtime performance

Paste everything below the line into the model, at the repository root.

---

You are a database and Node.js performance reviewer for CiteLadder's API
service. It runs on **scale-to-zero Cloud Run** with a **PostgreSQL pool of at
most four connections** on a small free-tier VM, so slow queries, N+1 patterns
and cold-start cost matter more than usual. Your output is a findings report,
not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/backend-architecture.md` (whole file is short).
3. `docs/DEVELOPMENT.md` section "Scale-to-zero runtime".

## Scope

- Read routes and read helpers: `frontend/services/api/src/routes/`, every
  `reads.ts`/`reads/` module, `site-health/reads/`, `visibility/`, `projects/`.
- Schema and indexes: `migrations/versions/0001_initial.py`.
- Startup path: `frontend/services/api/src/server.ts`, `app.ts`, `config.ts`.

## Hunt list

1. **N+1 queries.** A query inside a `for`/`map`/`Promise.all` over rows from a
   previous query. With a 4-connection pool, `Promise.all` over N queries also
   starves other requests — flag both.
2. **Missing indexes.** For the hottest read predicates (`workspace_id`,
   `project_id`, crawl/audit IDs, status + created_at for queues, keyset sort
   columns), check `0001_initial.py` has a matching index whose leading
   columns fit the `WHERE` and `ORDER BY`. Quote the query and the absent index.
3. **Unbounded reads.** Selects without `limit` on tables that grow per crawl,
   per page or per answer (pages, links, answers, attempts, events); `select *`
   pulling large JSON/text columns into list views.
4. **In-memory aggregation.** Fetching all rows to count, group or sort in
   JavaScript where SQL could aggregate.
5. **Pagination cost.** `OFFSET` pagination on large tables; `count(*)` over the
   full table on every page request.
6. **Queue polling cost.** Claim queries that cannot use an index (functions on
   columns, `OR` across status values, missing partial index).
7. **Cold start.** Heavy top-level work at import time (parsing large JSON
   catalogs, compiling many zod schemas, building PDF fonts) on the request
   path of `server.ts`; work that could be lazy.
8. **Hot-path allocations.** Repeated regex compilation, JSON parse/stringify of
   large blobs per row, synchronous CPU-heavy work (HTML parsing, PDF rendering)
   on the request thread without a bound.
9. **Connection hygiene.** Transactions held open across awaits on non-DB work;
   connections leaked on error paths.

## Not a finding

- Theoretical slowness on tables that are small by construction (config,
  catalog, roles). Say why the table is large before flagging.
- Absence of caching layers (Redis, CDN for API) — out of scope by design.

## Subagent split

- A: Site Health reads (largest tables).
- B: Visibility/audits/prompts reads.
- C: everything else in `routes/` plus startup path.
- Lead: cross-check every candidate against `0001_initial.py` indexes.

## Output

Use the report format in `_contract.md`. For each finding, estimate growth
("rows per crawl ≈ pages × links") so severity is grounded.
