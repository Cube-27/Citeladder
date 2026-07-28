# V7 Dashboard, Onboarding Tour, Reporting, and Run Efficiency

> **Status:** IN PROGRESS  
> **Started:** 2026-07-28  
> **Owner:** Searchify engineering  
> **Policy:** Greenfield build. No existing data must survive. Keep one complete
> `migrations/versions/0001_initial.py` revision and reset disposable databases.

## Outcome

Deliver an active-project Dashboard at `/projects`, an automatically queued
10-URL Free Site Health crawl during onboarding, a persisted cross-route product
tour, an authenticated executive PDF report, refreshed repository documentation,
and a research-gated audit cost/latency improvement track.

## Task Tracker

### T0 - Tracker and architecture lock

- [x] Create this tracker before implementation.
- [ ] Record discovered implementation deviations in the decision log.
- [ ] Update companion architecture/design/site-health documentation.

### T1 - Greenfield schema baseline

- [ ] Add product-tour state to `WorkspaceMember`.
- [ ] Add execution-cost projection persistence.
- [ ] Fold the brand-logo revision and all new schema into `0001_initial.py`.
- [ ] Delete every migration revision except `0001_initial.py`.
- [ ] Update migration-policy documentation.
- [ ] Verify a fresh upgrade and `alembic check`.

### T2 - Dashboard projection and PDF

- [ ] Add the workspace-scoped Dashboard read service and strict response DTO.
- [ ] Add `GET /api/v1/projects/{project_id}/dashboard`.
- [ ] Add `GET /api/v1/projects/{project_id}/dashboard/report.pdf`.
- [ ] Add ReportLab PDF rendering from persisted projections only.
- [ ] Add backend component/unit coverage.

### T3 - Dashboard frontend and routing

- [ ] Transform `/projects` into Dashboard while retaining project management.
- [ ] Add all Analyze/Improve summaries and direct links.
- [ ] Add authenticated PDF blob download.
- [ ] Route authenticated users with projects to `/projects`.
- [ ] Add focused frontend coverage.

### T4 - Onboarding Site Health

- [ ] Add the Finish phase.
- [ ] Queue `POST /site-crawls` automatically after project creation.
- [ ] Preserve project success when crawl creation fails.
- [ ] Show crawl success/failure state on Dashboard.
- [ ] Add focused onboarding coverage.

### T5 - Interactive product tour

- [ ] Add workspace-member product-tour GET/PATCH API.
- [ ] Install and configure Driver.js.
- [ ] Add the versioned cross-route step catalog and stable targets.
- [ ] Persist/resume step progress and terminal Skip/Done state.
- [ ] Add user-menu replay.
- [ ] Add keyboard, reduced-motion, missing-target, and route-transition tests.

### T6 - README and documentation

- [ ] Center the README header and simplify section links.
- [ ] Correct stale feature, worker, route, and migration documentation.
- [ ] Update backend/frontend/Site Health architecture docs.

### T7 - Cost and latency workstream

- [ ] Default new projects and first-run launch selection to one repetition.
- [ ] Add versioned provider pricing and immutable execution-cost estimates.
- [ ] Add `POST /api/v1/audits/estimate`.
- [ ] Show estimates in the launch dialog.
- [ ] Add provider-connection-aware worker capacity and pacing.
- [ ] Add the non-sensitive benchmark harness and measured release gates.
- [ ] Record provider-specific batch compatibility research; do not ship batch.

### T8 - Verification

- [ ] Run focused backend tests and Ruff.
- [ ] Run focused frontend tests, lint, policy checks, and build.
- [ ] Run fresh-database Alembic upgrade/check.
- [ ] Run the first-run Dashboard/tour/report Playwright flow.
- [ ] Record residual risks and final results.

## Public Contract Additions

- `GET /api/v1/projects/{project_id}/dashboard`
- `GET /api/v1/projects/{project_id}/dashboard/report.pdf`
- `GET /api/v1/workspaces/{workspace_id}/product-tour`
- `PATCH /api/v1/workspaces/{workspace_id}/product-tour`
- `POST /api/v1/audits/estimate`

## Dependencies

- T2 depends on T1's model vocabulary but may be developed before the migration
  baseline is regenerated.
- T3 depends on T2.
- T4 depends on the existing Site Health planner/API.
- T5 depends on T1 and may proceed in parallel with T2/T3 after API contracts
  are fixed.
- T7 is intentionally last and does not introduce the V5 Free/Paid retrieval
  profile split.
- T8 depends on every implementation task.

## Verification Commands

```bash
# backend/
uv run pytest tests/unit/test_dashboard.py tests/component/test_dashboard_api.py -q
uv run pytest tests/component/test_workspace_product_tour.py -q
uv run pytest tests/unit/test_audit_estimate.py tests/component/test_audit_worker.py -q
uv run ruff check .
uv run alembic upgrade head
uv run alembic check

# frontend/
pnpm test -- components/projects/dashboard-screen.test.tsx
pnpm test -- components/onboarding/onboarding-screen.test.tsx
pnpm test -- components/tour/product-tour-provider.test.tsx
pnpm test -- components/runs/launch-dialog.test.tsx
pnpm lint
pnpm check:policy
pnpm build
pnpm exec playwright test e2e/dashboard-onboarding-tour.spec.ts
```

## Decision Log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-28 | Keep `/projects` as the canonical Dashboard URL. | Avoid an alias and preserve the existing project-management entry point. |
| 2026-07-28 | Reset databases and maintain one `0001_initial.py` baseline. | Searchify is greenfield and no data compatibility is required. |
| 2026-07-28 | Generate reports from persisted projections only. | Preserves provenance and prevents provider/crawler calls from read paths. |
| 2026-07-28 | Use a cross-route, per-workspace-member tour with replay. | The experience must survive devices and guide users through real product surfaces. |
| 2026-07-28 | Keep provider batch APIs research-only. | Compatibility and measured economics are not yet proven. |

## Definition Of Done

- `/projects` is the post-auth Dashboard and summarizes every live product area.
- Project management remains available without leaving the Dashboard.
- Onboarding queues the Free Site Health crawl without blocking project success.
- The product tour runs once per workspace member, resumes, skips, completes,
  replays, and remains keyboard accessible across route changes.
- The PDF report downloads securely and names every persisted source it uses.
- The repository has one migration revision and fresh databases match the ORM.
- Cost/latency estimates, pricing provenance, and connection-aware worker
  capacity are implemented without changing measurement semantics.
- Focused verification is green and results are recorded in this tracker.
