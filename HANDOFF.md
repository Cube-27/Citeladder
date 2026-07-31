# HANDOFF — Site Health, Opportunities & Commerce improvements + app-wide error handling

> **For the external agent picking this up.** Branch: `vorflux/aeo-features-error-handling`
> (base: `main`). Written 2026-07-31. This file is session meta — delete it before
> the final PR merge.

## 1. What this is

An approved, twice-reviewed implementation plan is being executed against this
repo. The plan came from a full E2E testing pass (seeded data + **live site
crawls**: example.com success path + DNS/404/500 failure modes + an API
error-path probe matrix).

**Read these first, in order:**
1. `Agents.md` (repo bootstrap) and `docs/invariants.md` (12 hard rules — never break them)
2. The approved plan: `/code/.plans/v1-aeo-features-error-handling.md` (detailed, evidence-cited)
   and `/code/.plans/v1-aeo-features-error-handling-summary.md` (overview + decisions).
   If those paths are unavailable, ask for them — every work item cites its
   evidence and exact code placement. **Do not re-derive scope from this file alone.**
3. `docs/site-health.md`, `docs/roadmap/opportunities.md`,
   `docs/plans/commerce-suite/v1-commerce-suite.md` for subsystem context.

Design mockups for the UI changes: `/code/.plans/designs/` (3 HTML files +
`design-plan.json`).

## 2. Completed work (all on the branch, tested, lint-clean)

| Commit | Scope | Notes |
|---|---|---|
| `9234a31` | fix(frontend): accept additive audit shopping-surface snapshots field | Unbreaks `/visibility`; was an uncommitted local fix (known-issue #1) |
| `accd15a` | feat(backend): unified API error envelope + global handlers | **WS-A backend (A1+A7).** Canonical `{detail, error:{code,message,request_id,retryable,details?}}`; global `Exception` (500 `internal_error`, no internals) + `RequestValidationError` (422 `validation_error`, sanitized) handlers; `ApiException` + legacy shim; routers migrated: site_health, opportunities, products, commerce; Pydantic-leak sanitization; parser/link_check silent swallows fixed. 485 focused + 1674 unit/component tests pass |
| `236a38a` | chore(backend): commit dev seed script | `backend/scripts/seed_dev_data.py` now tracked, ruff-clean |
| `d93ad1a` | feat(frontend): robust API error handling + contract-drift guard | **WS-A frontend (A2–A6).** `ApiError.code/retryable`; `readErrorBody` parses all 4 envelope shapes; 30s fetch timeout (`NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS`); `MutationNotice` pattern (4xx verbatim reason / 5xx retry copy) at 6 mutation sites; **tolerant-on-unknown response validation** (approved A5 option) + `pnpm check:contract` drift guard; request-id in error UI; `docs/frontend-architecture.md` §6 rewritten. 1170 vitest pass |
| `1073227` | feat(backend): deterministic product-mentioning seed fixtures | **D3.** md5-based prompt bucketing (was salted `hash()`); fixture answers mention Summit 40L $189.99 / Voyager 25L $129.99 / TrailBlaze Alpine 45 $174.99 → 96 ProductMentions, non-zero snapshots, byte-identical across reseeds |
| `fe01c54` | feat(opportunities): target labels, provenance drawer, commerce rules, freshness | **WS-C (C1–C4).** Backend `target_label` from frozen evidence (survives prompt deletion; client `targetLine` deleted); drawer renders provenance deep-links + priority + versions; new rules `schema_type_mismatch`, `product_not_mentioned`, `competitor_product_dominates`, `price_mention_mismatch` (`RULE_VERSION=opp-rules-2`); audit-finalize recompute hook after `_finalize_analysis` commit; read-time staleness badge. Also fixed a pre-existing featured-card gate bug |
| `571879e` | feat(commerce): import feedback, run-aware empty states, catalog robustness | **WS-D (D1+D2+D4).** Import returns `{items, summary:{created,updated,skipped,errors[]}}` (coordinated breaking change, both frontend callers updated); three run-aware Visibility-tab states; drill-down copy fix; completeness hover; audit-reference delete guard |
| `0301f83` | feat(site-health): surface failed-crawl reasons across API and UI | **WS-B (B1–B3).** See §3 — verification pending |

### Key approved decisions (do not relitigate)
- **A5 validation policy:** tolerant `.strip()` on unknown response keys +
  CI drift guard (replaces fail-loud strict objects — doc §6 rewritten).
- Error envelope is **additive** (`detail` retained) — non-breaking.
- Failed crawl emits a **real `crawl.failed` event** (not `crawl.completed`).
- Root failures project as a **separate `root_errors` array**, never synthetic
  rows in the cursored pages contract.
- Target presentation is **backend-owned** (`target_label`), one owner.
- Import response change is a **deliberate breaking change** (shape + callers
  in one commit).
- Opportunity staleness is **read-time** (no persisted marker, no migration).

## 3. Committed late, verification pending — RUN THE SUITES FIRST

**B1+B2+B3 — Site Health failed-crawl surfacing** landed as commit `0301f83`
(31 files, +1572) but was committed at the user's direction **before its
in-session verification completed**. Before building B4–B6 or opening the PR:
1. `cd backend && uv run pytest tests/unit tests/component -q -k "site_health or crawl or failure" && uv run ruff check app tests`
2. `cd frontend && pnpm test -- site-health && pnpm lint && pnpm build`
3. Fix anything red in place; the implementation approach is documented in
   `docs/site-health.md` (commit `0301f83` diff) and plan items B1/B2/B3
   define the acceptance criteria (phase-clause placement between clause 2 and
   3, `crawl.failed` instead of `crawl.completed`, humanized `error_message` +
   `failure_summary`, `analysis_status=failed` on fully-failed discovery,
   robots.txt `not_found` vs `fetch_failed`, `root_errors` projection separate
   from the cursored pages contract).

## 4. Pending work (not started)

Plan references are to the detailed plan file.

1. **B4 — Scheduled recrawls.** Workspace/project cadence (off/daily/weekly);
   knobs in `core/config/site_health.py`; **requires an additive alembic
   revision** adding `crawl_cadence` + `next_scheduled_crawl_at` to
   `site_health_profiles` (never edit `0001_initial`); scheduler pass inside
   the existing `site_health_worker` loop (dispatcher pattern) enqueuing due
   recrawls through the same `create_crawl()` planner; UI cadence control +
   "last/next scheduled crawl" on the Site Health screen. Verify
   `uv run alembic upgrade head` + `uv run alembic check` on a disposable DB.
2. **B5 — Crawl-over-crawl diff.** `GET /projects/{id}/site-health?compare_to=<crawl_id>`
   projection (score deltas, new/resolved/unchanged issues from persisted
   analyses; projection only, invariant 7); UI delta badges + "since last
   crawl" section.
3. **B6 — Minor presentation.** TTFB (and other delivery metrics) render "—"
   when `0`/unmeasured.
4. **Simplify + review pass** over the full branch diff (per repo workflow:
   refactor pass, then correctness review).
5. **E2E regression** — re-run the matrix in §5.
6. **PR creation** — push all commits, write the PR description with a full
   `## Testing` section, delete this handoff file.

## 5. Verification

### Automated
```bash
# Backend (needs only local Postgres running; suite makes a throwaway DB)
cd backend && uv run pytest tests/unit tests/component -q && uv run ruff check .
# Migrations (B4): disposable DB only
cd backend && uv run alembic upgrade head && uv run alembic check
# Frontend
cd frontend && pnpm test && pnpm lint && pnpm build && pnpm check:contract
```

### E2E regression matrix (what the original testing did — re-run it)
Stack: backend :8000, frontend :3000, Postgres (`docker-db-1`, host port
55432), 6 workers. Seed: `bash /memory/testing/Searchify/seed.sh
<code-repo-path>` (idempotent; **wipes + recreates the demo workspace — project
UUIDs change every reseed**). Login: `demo@searchify.dev` / `DemoPass123!`.

1. **Seeded UI walkthrough:** `/site-health` (score 84.2, AI-crawler panel),
   `/issues` (7), `/opportunities` (target labels now distinguish rows; drawer
   Source populated; staleness badge), `/products` (Catalog badges; **Visibility
   tab now shows non-zero mentions/SOV/rank/price accuracy**; Attribution
   empty state), product drill-down.
2. **Live crawl:** create a project with a real URL (e.g. https://example.com),
   let the auto-crawl finish, select the discovered URL as monitored
   (`PUT /api/v1/projects/{id}/monitored-urls` with
   `expected_selection_version`), `POST /api/v1/site-crawls`, poll to terminal.
   Expect analyzed pages + scores; opportunities auto-recompute on crawl
   finalize (hook already existed) and now on audit finalize too.
3. **Failure modes:** projects with (i) a non-resolving domain, (ii) a 404
   root, (iii) a 500 root (e.g. httpbin.org/status/500). **Acceptance for
   B1–B3:** each renders a DISTINCT, reasoned failure state (DNS vs 404 vs
   500) via the terminal card; `GET /site-crawls/{id}` carries humanized
   `error_message` + `failure_summary`; events show `crawl.failed`; Errors &
   Blocked shows the `root_errors` block; `analysis_status` is `failed`, not
   vacuous `completed`.
4. **API error probes:** invalid UUID (422 `validation_error` envelope),
   nonexistent/cross-workspace id (404 string detail preserved), malformed
   JSON (422), unauthenticated (401), stale `expected_selection_version` (409
   `stale_selection_version` + `current_selection_version`), second active
   crawl (409 `crawl_already_active`), attribution recompute without sync (422
   precondition shown verbatim in UI, no "try again"), CSV import with
   missing-sku rows (201 with `summary.errors`, no silent skips), JSON import
   bad price (422 sanitized — no Pydantic internals).
5. **Contract guard:** `pnpm check:contract` passes; adding an additive
   backend field does NOT break the frontend (tolerant policy) but WARNs;
   removing a declared field FAILs the guard.

## 6. Gotchas (learned the hard way)

- **Seed wipes the demo workspace** — reseeding changes all project UUIDs;
  update any hardcoded ids in test notes.
- **Worker/seed race:** live workers can steal seeded audit tasks (fake
  provider keys → `auth_failure` noise). Pause `audit_worker` /
  `site_health_worker` (`kill -STOP <pid>`) during seed verification if you
  need clean counts; resume after (`kill -CONT`). See
  `/memory/testing/Searchify/known-issues.md` #5.
- **Do not edit `0001_initial` migration** — additive revisions only.
- **Free tier is fail-closed** for site health (full_discovery requires
  starter); the seeded demo workspace has starter.
- **Frontend production build fails closed on loopback `BACKEND_ORIGIN`** —
  use a placeholder like `BACKEND_ORIGIN=http://backend:8000` for `pnpm build`.
- Config never goes inline (invariant 1): new tokens/thresholds/limits go to
  `backend/app/core/config/*` or `frontend/lib/config/*`.
- Opportunities: supersede-not-mutate (a superseded row keeps `status=open`;
  liveness is `superseded_by_id IS NULL` — filter on reads).

## 7. Session artifacts

- Approved plan v1 (2 review rounds, 17 findings incorporated):
  `/code/.plans/v1-aeo-features-error-handling.md`
- Test Report #371 "E2E: Site Health, Opportunities, Commerce (seed + live
  crawls)" — evidence screenshots under `/code/.generated_artifacts/images/`
- Memory: `/memory/testing/Searchify/` (setup-instructions, seed.sh,
  known-issues incl. #5 worker race, test plans)
