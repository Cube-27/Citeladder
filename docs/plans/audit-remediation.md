# Audit remediation

Status: **active** (owner, 2026-11-12). Specs are listed in priority order. PRs
inside a spec touch disjoint files and can run in parallel. A spec or PR that
needs earlier work says so under **Depends on**. A spec with no dependency may
also start before an earlier spec has finished.

Source: the read-only multi-agent audit of 2026-11-12 at baseline `000be94d2`.
It produced 185 findings: 0 Critical, 3 High, 26 Medium, 124 Low and 32
Informational. Finding IDs (`OPS-001`, `BE-501`, …) are the audit's IDs. The
full evidence report is local to the owner's machine
(`.artifacts/audit-2026-11-12/AUDIT-REPORT.md`, git-ignored). This plan does not
depend on it: each PR names its findings, the defect and the owning files. Before
coding, re-confirm each finding against current `main`, because code may have
moved since the baseline.

Feature owners in [the documentation index](../README.md) and the
[invariants](../invariants.md) remain authoritative.

**Routed elsewhere:**
- Site Health crawl findings are [Spec 5](#5-site-health-crawling-and-issue-tracking).
  Their detail lives in the
  [Site Health crawl plan](site-health-baseline-crawls.md#audit-findings-absorbed-2026-11-12).
- The billing-owner transfer goes to the [backlog](backlog.md#billing-and-entitlements).
- The [open owner decisions](#open-owner-decisions) at the end are not
  authorized for execution.

## Rules for every PR

- Follow `CLAUDE.md`, the invariants and [Review](../../Review.md).
  - One coherent slice under the existing owner.
  - Tests at the lowest meaningful boundary. Concurrency and persistence changes
    use the real PostgreSQL boundary.
  - Update only the owner documentation whose contract changed.
- **Migrations** are new forward files from `0002_…` onward. PRs that add a
  migration may be written in parallel, but they merge one at a time: renumber
  on rebase. Greenfield: no data backfills (see each PR's note).
- **Owner decisions** this plan relies on are in
  [Owner decisions](#owner-decisions-2026-11-12). A PR that relies on one cites
  it, for example "AR-3".
- **Agent-decided items** are technical fixes, or fixes that restore documented
  behaviour. They need no owner answer. They are marked "decided" where the
  choice was not obvious.

---

## 1. Production safety and deploy trust

The irreversible-harm paths and the deploy trust root. The PRs run in parallel.

### a. PR 1: Fail-closed environment and secret checks
- **OPS-011:** an unset or unknown `APP_ENV` falls back to development and
  disables every production assertion.
  - Make startup refuse unless `APP_ENV` is a known value (**AR-1**).
  - Set it explicitly in `.env.example`, `docker-compose.yml`, the local and test
    environments, and the CI jobs.
  - Owners: `config.ts`, `config/api.json`.
- **SEC-003:** `assertDeployable` accepts the `.env.example` placeholder
  secrets.
  - Add a structural placeholder rule.
  - Add a test that reads `.env.example` and asserts that every secret in it
    fails the production check.
  - Owners: `config.ts`, `config/auth-runtime.json`.
- **Done when:** the API refuses to start with `APP_ENV` unset or misspelled;
  every `.env.example` secret fails `assertDeployable`; local, CI and Compose
  smoke still start.

### b. PR 2: Move dev-only seed and reset tooling out of the repository
Owner instruction (**AR-2**): the guard redesign stays an open decision, but
these scripts leave the tracked repository and live in a git-ignored local
folder.
- **Inventory first** (replacement gate):
  - `cli/seed-*.ts`, `cli/reset-*.ts`, `cli/provision-dev-login.ts`,
    `cli/local-environment.ts`, `config/dev-seed.ts` and `audits/seed.ts`.
  - The orphaned `cli/seed-audit.ts` (**BE-705**).
  - `scripts/reset-db.ps1` and `scripts/provision-dev-login.ps1`.
  - Their `package.json` scripts, the docs that run them (`DEVELOPMENT.md`,
    the runbooks), any CI step (Compose smoke), and tests that import them.
- **Move them** to a git-ignored folder (for example `local/dev-tools/`) and add
  it to `.gitignore`. Remove the `package.json` entries and doc steps, or point
  them at the local folder as an optional convenience.
- **Tests and CI:** any test or CI path that needs seed data gets its fixtures
  from the existing test fixtures (`test/fixture-workspace.ts`), never from the
  moved scripts.
- **The committed password:** removing it from the tree does not remove it from
  git history. Rotate any account in any environment that ever used the
  password from the former `config/dev-seed.ts`.
- **OPS-013:** also git-ignore `frontend/apps/api-host/.dev.vars`, and add
  `.dev.vars*` to `.dockerignore`.
- **Done when:**
  - `git ls-files` shows none of the moved files.
  - CI and Compose smoke are green without them.
  - A fresh clone has no committed seed password.

### c. PR 3: Deploy pipeline trust
- **OPS-006 (code half):** add `job_workflow_ref` (the deploy workflow) and
  `repository_id` to the WIF provider condition (`infra/gcp/bootstrap.ps1`,
  `identity.tf`).
- **OPS-007:** the deploy gate trusts only the last `ci.yml` run, ignores
  Compose smoke, and a docs-only commit can mask code that was never validated.
  Gate on the CI result for the exact deployed SHA, Compose smoke included
  (`.github/workflows/gcp-deploy.yml`, `require-green-main`).
- **OPS-010:** the origin smoke runs after the 100% cutover. Deploy the new
  revision with no traffic, smoke it at its tagged URL, then shift traffic; a
  failed smoke leaves traffic on the old revision.
- **OPS-009:** narrow the deployer service account.
  - Drop `projectIamAdmin`.
  - Replace `secretmanager.admin` with per-secret accessor and version-adder
    roles, and scope `compute.admin` and `storage.admin` to the resources it
    deploys.
  - Correct `GOOGLE_CLOUD.md`, which understates its reach.
- **OPS-012:** list the repo-level secrets that no workflow reads (including the
  extra `ORIGIN_TOKEN` copies) in the PR description. The owner deletes them in
  GitHub settings; the agent does not mutate GitHub.
- **Done when:** a workflow other than the deploy workflow cannot obtain
  credentials, and a red Compose smoke or a failed tagged-revision smoke blocks
  traffic.

### d. Owner action (not a PR): finish the `main` ruleset (OPS-006 + QA-004)
The owner added ruleset `branch protection` on 2026-11-12. It blocks deletion
and requires a pull request with 0 approvals. Still missing:
- A required status check: today the list is empty. Add the aggregate CI check
  once Spec 10's PR 32 has settled its name.
- Block force pushes (`non_fast_forward`).
- Decide whether admins keep "always" bypass.

---

## 2. Abuse limits and data-exposure fixes

Depends on PR 1 for PR 4 only: Turnstile's development and test secrets key off
`APP_ENV`. Otherwise the PRs run in parallel with each other and with Spec 1.

### a. PR 4: Per-network abuse budgets and login challenge (AR-3)
- **SEC-001:** per-client budgets key on the exact IP, so IPv6 rotation bypasses
  every per-client limit.
  - Derive the client subject from the IPv6 /64 (/56 for registration), with
    IPv4 unchanged.
  - Add a global or per-/48 login-failure ceiling.
  - Show a Turnstile challenge on login after 5 failures for that email or
    network.
  - Owners: `auth/client-identity.ts`, `http/origin-token.ts`, `abuse/usage.ts`,
    `config/abuse.ts`, `routes/auth.ts`, `auth/human-verification.ts`, the
    frontend login form.
- **SEC-002:** anonymous traffic drains the global MCP registration and
  authorization budgets.
  - Parse and validate before spending budget.
  - Give anonymous registration its own smaller pool keyed per network.
  - Owners: `mcp/oauth-routes.ts`, `mcp/registration.ts`.
- **Done when:** addresses in one /64 share a budget; the challenge appears
  after the 5th failure; a registration flood leaves the authorization budget
  usable.

### b. PR 5: Off-site link confirmation in Agent replies (AR-4)
- **SEC-007:** a prompt-injected page can make the Agent emit a link carrying
  project data in its query string.
  - Links to hosts outside the project's own domains and the turn's cited
    sources open a "You're leaving CiteLadder" confirm that shows the full URL.
  - Known hosts open directly.
  - Owners: `frontend/lib/markdown/markdown.tsx`, `lib/safe-url.ts`, the Agent
    reply components, and the host allowlist from the turn's context.
- **Done when:** a component test covers the known-host and unknown-host paths.

### c. PR 6: MCP privacy, stream membership and audit trail (decided)
- **BE-703:** MCP `fetch` returns URL query strings and fragments that
  `docs/mcp.md` promises to strip. Apply the Site tools' `withoutQuery` in
  `mcp/retrieval.ts` `attachSitePage`.
- **SEC-102:** a removed member keeps an open event stream for up to 300 s.
  - Re-check membership on the stream's poll cadence (at most every 30 s) and
    close the stream when access ends.
  - Owners: `audits/events.ts`, `site-health/reads/events.ts`.
- **Integration mapping delete** writes no `integration_events` row. Record one,
  as disconnect already does (`routes/integrations.ts`, the integrations owner).
- **OAuth `code` and `state` in edge logs:** keep them out of Worker invocation
  logs (the app and api-host Workers' logging).
- **Done when:** a retrieval test asserts no query string; a stream test removes
  a member and sees the stream close.

---

## 3. Data, migration and operations safety

### a. PR 7: Least-privilege database role
- **Depends on:** PR 3 (both edit `gcp-deploy.yml`).
- **OPS-003 (+DB-002):** the app connects as the bootstrap superuser.
  - Create a DML-only application role and keep the owner role for migrations.
  - `REVOKE UPDATE, DELETE` on the append-only evidence, attempt and ledger
    tables (invariants 4 and 16).
  - Owners: `infra/gcp/postgres-vm.sh`, `gcp-deploy.yml` secrets, a forward
    migration for the grants, `db/database.ts` configuration.
- **Done when:** the API suite runs as the app role, and an UPDATE on an
  append-only table fails with a permission error in a test.

### b. PR 8: Migration safety and runbooks
- **OPS-004 (+DB-003):** contracting migrations break the revision that is
  still serving, and the documented rollback is unsafe.
  - The migrate CLI sets `lock_timeout` and `statement_timeout`.
  - Document expand and contract in the migration owner doc: drop columns and
    tables one release after the code stops using them.
  - Rewrite the rollback section of `GCP_RUNBOOK.md`.
- **QA-008:** the migration test pins the full migration list four times, so
  every migration PR edits it. Assert properties (ordering, checksums, no gaps)
  instead.
- **OPS-015:** correct the inaccurate runbook steps the audit listed (the
  `GCP_RUNBOOK.md` and `WORKERS_RUNBOOK.md` procedures).
- **Done when:** a test proves the migrate CLI's timeouts are set, and adding a
  migration needs no edit to the migration test.

### c. PR 9: Monitoring and health
This replaces the backlog's "Alerts on failed job executions and errors" line.
- **OPS-005:**
  - Add an uptime check on `/health`.
  - Add log-based alerts on the 5xx rate, runner or job execution failures,
    webhook quarantine and database disk usage.
  - Send them to an email channel set by a Terraform variable.
  - Owner: `infra/gcp/` (a new `monitoring.tf`).
- **OPS-008:** `logging.ts` emits Cloud Logging `severity` (ERROR, WARNING,
  INFO).
- **OPS-017:** add an HTTP liveness probe on the API service (`run.tf`).
- The probe and the uptime check cannot sign requests, so `GET /health` skips
  the origin token (**AR-10**).
- **Done when:** a synthetic error fires an alert in a staging-like check, and
  the plan is no-op apart from the new resources.

### d. PR 10: Schema tenancy keys (decided)
- **Depends on:** PR 7, so the grants cover the new columns. Merges after PR 7's
  migration.
- **DB-001:** 9 project-owned tables lack `workspace_id`, and parents are keyed
  by single-column foreign keys.
  - Add `workspace_id` with composite foreign keys to the owning parent.
  - Greenfield: check production row counts first. Where rows exist, fill the
    column from the parent in the same migration.
- **SEC-103:** shared read helpers such as `visibility/ranking-marks.ts` filter
  by `project_id` only. Add the workspace filter.
- **SEC-104:** `routes/brand-identity.ts:147-156` lacks
  `authorize: 'active-project'`. Add it.
- **Done when:** a schema test shows a cross-workspace child row is refused.

---

## 4. Backend core correctness: concurrency, billing internals, integrations, Agent

The PRs run in parallel.

### a. PR 11: Restore the lock order (decided)
- **Coordinate with:** [Spec 5](#5-site-health-crawling-and-issue-tracking),
  which also edits admission. Land this first: its A2, A5 and B1 start after it
  merges.
- **BE-001 (+ARC-004):**
  - Billing and crawl admission write the Site Health runtime row while holding
    the account-capacity lock.
  - `lockControlScope` locks project, then crawl, then runtime, while discover
    commits lock runtime, then crawl.
  - The result is deadlock (40P01) 500s on crawl create, recrawl, page rerun and
    monitored-set saves.
  - **Fix:** take locks in the documented DAG order, and move the runtime
    refresh out of billing transactions. Add a lock-rank assertion in tests.
  - Owners: `entitlements/grants.ts`, `site-health/plan-runtime.ts`,
    `selection.ts`, `controls.ts`, `lifecycle.ts`, `discover-task.ts`.
- **Done when:** a real-PostgreSQL concurrency test of the crawl-control and
  discover interleaving passes repeatedly.

### b. PR 12: Billing internals and trial purge (decided)
- **BE-004:** subscription evidence version falls back to 0 when the provider
  omits `updated_at`. Use the provider event time or refuse the read
  (`billing/razorpay.ts`, `settlement.ts`).
- **BE-304:** an operator override's reason is only logged. Store it in grant
  evidence, and reject a replay with a different reason (invariant 16).
- **BE-305:** replacing a draft catalog overwrites the earlier request's
  idempotency key. Keep each key's own result.
- **BE-307:** the trial purge's locked recheck must repeat the "never held a
  non-trial grant" exclusion (`projects/trial-purge.ts`).
- **DB-008:** the same purge takes cascade row locks after the capacity lock.
  Reorder to the DAG.
- **DB-007:** answer-engine internal-cost records cascade away with project
  deletion. Keep them (SET NULL), like Agent and platform costs.
- **Done when:** each item has an API test at the owner.

### c. PR 13: Connected data and Search Intelligence (decided)
- **BE-005:** an OAuth `invalid_grant` is a generic provider error. Classify it
  as `needs_reauth`, so the user is asked to reconnect (`integrations/client.ts`,
  `tokens.ts`, `workers/integration-worker.ts`).
- **BE-601:** a Search Console day still not final after 4 days is never
  re-fetched and later reads as zero. Re-fetch until final, or mark it unknown.
- **BE-602:** `partition_fallback` revisions are treated as flagged. The owner
  defines them as complete evidence.
- **BE-605:** give each artifact its own AI Referrals refresh key.
- **BE-606:** end sync windows on the property's local yesterday, not UTC.
- **BE-607:** Performance `covered_days` counts days actually imported.
- **BE-204:** a parked Keyword Research run whose connection changed must not
  become `failed` after publishing datasets.
- **BE-603:** citation matching inserts in one statement and exceeds the
  65,535-parameter limit. Batch the inserts.
- **Done when:** each item has an owner test, and a GA4 property west of UTC
  never publishes its partial current day.

### d. PR 14: Agent runtime (decided)
- **BE-102, BE-407:** turn sources list records that the result-size bound or
  context trimming dropped before the model saw them. Sources come from what the
  model received (invariant 12; `agent/sources.ts`, `context.ts`, `runtime.ts`).
- **BE-105:** the read timeout and Stop end the wait but not the work. Pass the
  abort signal through the shared reads.
- **Done when:** a test asserts that dropped records are not sources, and that an
  aborted read stops issuing queries.

### e. PR 15: Audits and queue robustness (decided)
- **BE-002:** a non-retryable scheduling failure overwrites the cadence anchor.
  Keep the anchor.
- **BE-003:** audit finalize runs unguarded in `finally`. Isolate each audit's
  finalize failure so one audit cannot fail the lane, and stop `runOnce`
  detaching sibling tasks.
- **BE-103:** the cost estimate counts archived and over-plan prompts. Estimate
  what the launch will run.
- **BE-403:** a database failure while saving a paid surface answer becomes a
  terminal provider `parse_error`. Make it retryable.
- **PERF-005:** runner start waits on the request path and can start duplicate
  executions. Make the start non-blocking and single-flight.
- Owners: `audits/*`, `workers/runner.ts`, `start-runner.ts`.
- **Done when:** each item has a queue test at the owner.

---

## 5. Site Health crawling and issue tracking

This spec holds the audit's 16 Site Health crawl findings, including ARC-001
(High). It also holds the owner's new crawl model. Each project has one fixed
set of "tracked pages", up to the plan limit. Every crawl re-audits those same
pages, so issues are tracked page by page over time.

The [Site Health crawl plan](site-health-baseline-crawls.md) contains:
- the [model](site-health-baseline-crawls.md#model-decided);
- the owner decisions SH-B1 to SH-B13;
- the [engineering defaults](site-health-baseline-crawls.md#engineering-defaults);
- the [findings table](site-health-baseline-crawls.md#audit-findings-absorbed-2026-11-12);
- the scope and done-when of each PR, under [PR breakdown](site-health-baseline-crawls.md#pr-breakdown).

This spec only orders those PRs; the PR breakdown is authoritative for their
content. Ask agent in the drawer is not in this spec: it waits on an owner
decision.

- **Depends on:**
  - PR 11 (Spec 4), before A2, A5 and B1.
  - PR 24 (Spec 7), before B4 and B5.

| PR | Scope | Findings | Depends on | Runs in parallel with |
|---|---|---|---|---|
| A1 | One current-crawl owner (SH-B1) | ARC-001, BE-106 | nothing | A3, A4, PR 11 |
| A2 | Reruns are not site crawls | BE-504 | PR 11 | A1, A3, A4, A5 |
| A3 | Verification follows SH-B2 | BE-801, BE-802, BE-806 | nothing | A1, A4, PR 11 |
| A4 | Small Site Health correctness fixes | BE-907, BE-505, BE-502, BE-508, BE-506 | nothing | A1, A3, PR 11 |
| A5 | Freeze the tracked set's inputs (SH-B4, SH-B13) | BE-903, BE-904, BE-905 | PR 11 | A1–A4 |
| B1 | Sitemap discovery and the tracked set | PERF-006, `random_seed` | A5, PR 11 | B2 |
| B2 | Issue state and trend | — | A1, A2 | B1 |
| B3 | Reads move to per-page latest | PERF-007 | B1, B2 | B5 |
| B4 | One crawl button, open-issues trend, Changes copy | — | B3, PR 24 | nothing (last) |
| B5 | Mark fixed and Re-run all | — | A5, B2, PR 24 | B3 |

---

## 6. Measurement correctness

The PRs run in parallel. They change what metrics read, so each PR's description
lists the user-visible metric changes.

### a. PR 16: Answer engines and prompts (decided)
- **BE-101:** an answer with a failed, cancelled or paused finish reason is
  scored as a success.
  - Record it as a failed observation, not "not mentioned".
  - Build the classification from recorded fixtures.
  - Gemini `COMPLETED` without a response stays failed.
- **BE-104:** Claude answers are rebuilt by trimming blocks. Join citation-split
  sentences, and exclude the search preamble (`answer-engines/parse.ts`,
  `perception/passages.ts`).
- **BE-804:** an engine whose every task failed disappears from the per-prompt
  engine table. Show it as failed.
- **BE-107:** the frozen `measurement_policy.repetitions` records the run's own
  repetition count.
- **BE-803:** MCP `prepare_add_prompts` turns an omitted cohort into `core` and
  skips brand filing. Apply filing as the browser does (`mcp/write-tools.ts`).
- **Done when:** fixture tests cover each finish reason.

### b. PR 17: Brand and domain matching (AR-5, AR-6)
- **BE-702 (AR-5):** onboarding stores shared-host sites as their registrable
  domain (`acme.myshopify.com` becomes `myshopify.com`).
  - Use the public-suffix private section plus a configured shared-platform list
    (`config/`), so shared-platform sites keep their full host.
  - Owners: `projects/discovery.ts`, `projects/research.ts`, `safe-fetch.ts`
    registrable-domain helper, `analysis/domains.ts`.
- **CQ-004:** host normalization exists about nine times, and the copies disagree
  on trailing dots. Consolidate on one owner, which PR 17 then uses.
- **BE-402 (AR-6):** stop joining separate words unless the brand's configured
  aliases include the spaced form.
- **BE-901 (AR-6):** names under 3 characters read "not assessable" on cited
  pages, with no gap standing and no earned Action.
- **BE-902:** "present" verdicts quote only matches the entity policy accepts.
- **BE-604:** verdicts recorded against an outdated roster are re-evaluated when
  the roster changes.
- **BE-704:** persist the identity model's `insufficient_evidence` verdict.
- **Done when:**
  - `acme.myshopify.com` owns only itself.
  - "your sales force" does not match Salesforce.
  - A 2-character brand produces no listing gap.

### c. PR 18: Visibility, Overview and exports (decided)
- **BE-401:** Top movers is filtered to the default market. Scope the baseline
  by the run's market (`visibility/source-movers.ts`, `selection.ts`).
- **BE-701:** the Overview PDF's Top movers and Retrieved-versus-cited read every
  run. Read the latest run (`projects/overview-report-library.ts`).
- **BE-805:** the evidence prompt-filter options come from brand runs only.
- **BE-405:** unknown measurement states become `False` or `0` in the audit CSV
  and the Visibility `total_fai…` output. Emit empty or unknown.
- **BE-909:** PDF fact, ranked, note and callout blocks split across pages.
- **FE-106:** round the Overview Top-movers deltas.
- **Done when:** read tests cover a non-default market and the PDF's latest-run
  sections.

### d. PR 19: Commerce (decided)
- **BE-201:** prices followed by punctuation (`$59.`, `$129.99,`) parse as no
  price. Accept trailing punctuation and locale formats
  (`commerce/shelf-parsing.ts`, `projection-facts.ts`).
- **BE-404:** Commerce Opportunities follow catalog edits and re-matching.
  Include the catalog fields in the source identity, and enqueue on backfill
  passes.
- **CQ-005:** convert Shopify `body_html` through the parse5 owner, not a regex.
- **Done when:** parser tests cover the punctuation and locale cases.

### e. PR 20: Site Health page analysis and fetch (decided)
Page-level analysis only. Crawl selection and tracking belong to the baseline
plan.
- **BE-501:** microdata properties are never recorded, so correct microdata
  fails `aeo.schema_required_valid` (`site-health/analysis/structured-data.ts`).
- **BE-503:** resolve links against `<base href>`.
- **BE-203:** an agent-scoped X-Robots-Tag must not swallow a generic one.
- **BE-507:** a 404 robots.txt means "no rules", so crawler access is measured,
  not `unknown` (RFC 9309).
- **BE-202:** a transient robots.txt failure (429, 5xx, timeout) fails every page
  of the host for 5 minutes. Retry with backoff, and don't cache transient
  failures as terminal (`page-fetch.ts`, `web-evidence/acquisition.ts`).
- **CQ-002:** `visibleText` spreads into `push(...)` and throws on 520 KB pages.
  Iterate instead.
- **PERF-009:** add a per-job time limit on the page-interpretation worker.
- **BE-906:** bound internal-link judging concurrency, as the module claims.
- **DEP-008:** stop reading `robots-parser`'s private `_rules`.
- **Done when:** analysis tests cover each case with fixtures.

---

## 7. Unknown is not zero (invariant 7)

Failed, pending or unmeasured reads must not render as measured zero or "no
data".

### a. PR 21: Shared screen-state foundation
- One shared screen-state component plus a helper that maps a query's pending,
  failed and not-measured states to explicit copy: "Couldn't load", with Retry,
  and "Not measured yet".
- Add typed unknown and unavailable states to the contracts that need them
  (`packages/contracts`). A breaking change is allowed before launch.
- **Done when:** component tests cover each state.

### b. PR 22: Visibility screens
- **Depends on:** PR 21.
- **FE-201 (+FE-305):** every Visibility tab except Trends shows "No answers
  named you" or "No sources" for failed or pending reads, and the source URL
  pages do the same (`components/visibility/*`).
- **FE-003 (+FE-308):** other read failures render as empty content.

### c. PR 23: Connected-data screens
- **Depends on:** PR 21.
- **FE-202:** AI Traffic always says "GA4 · Synced", because `window_end` is
  never null. Make it nullable and offer Connect GA4.
- **FE-302:** a failed range projection says "No imported data covers this
  range". Show the failure and retry.
- **FE-307:** a connected Bing source that measured zero hides its panel. Show
  it.
- **FE-111:** "0 landing rows excluded" appears when the data is absent. Show
  "not available".
- **BE-706:** MCP crawl-log and AI-traffic reads report `available` with no
  source connected. Report `not_connected`.

### d. PR 24: Site Health and Products screens
- **Depends on:** PR 21.
- **FE-301:** a pending or failed Site Health read shows "No crawl yet" on
  Products and turns Refresh into starting a crawl.
- **BE-908:** page detail reports zero H1s, words and links for a page that was
  never analyzed. Return "not analyzed".
- **FE-205:** the Pages "#" column restarts on every keyset page.
- **FE-306:** a failed later page hides the issue pager (now in
  `issue-detail-dialog.tsx`).
- **FE-105:** "Retry" after a failed crawl start posts the click event, and
  start or stop failures follow the reader into the next project.
- **FE-109:** clearing the Issues search box leaves the list filtered.
- **Coordinate with:** [Spec 5](#5-site-health-crawling-and-issue-tracking).
  Its backend PRs keep these screens' response shapes, and its UI PRs B4 and B5
  start after this one merges. Keep this PR small.

---

## 8. Frontend access, platform and UX

- **Depends on:** Spec 7, which edits the same screens.
- The PRs run in parallel with each other.

### a. PR 25: Role-aware UI and session handling (AR-7)
- **FE-102 (+FE-101):** viewers see every write and run control.
  - Do not render controls the role lacks, using one capability hook
    (`useWorkspaceCapability`).
  - Covers the prompt toolbar, Launch audit, Site Health, integrations,
    providers and the other controls the audit listed.
- **FE-002:** a failed workspace-access read shows the "access ended" screen.
  Show the error state instead.
- **FE-004:** a 401 on a mutation (Sign out included) strands the user. Route it
  through the session guard.
- **FE-005:** the event-stream hook reconnects forever on non-retryable refusals.
  Stop on 401, 403 and 404.
- **FE-007 (+FE-103, FE-104, FE-105 second half):** project-scoped drafts and
  state survive a project switch. Key them by project id.
- **Done when:** component tests per role, and a project-switch test.

### b. PR 26: Raise the browser support matrix (AR-8)
- **FE-001:** the code uses `AbortSignal.any` and `URL.canParse`.
  - Raise `browserslist` in `frontend/package.json` to `chrome >= 120`,
    `edge >= 120`, `safari >= 17.4`, `ios_saf >= 17.4`, `samsung >= 25`;
    Firefox is unchanged.
  - Update `apps/app/vite.config.ts` if it mirrors the matrix, and the docs that
    state the supported browsers.
  - Show an "Update your browser" notice on older browsers before the app shell
    loads.
  - Add a compat lint so CI fails when code uses an API newer than the matrix.
- **Done when:** the lint passes on the raised matrix and fails on a deliberate
  newer API.

### c. PR 27: Imports and free tools (AR-9)
- **FE-008:**
  - Decode CSV and feed imports strictly as UTF-8.
  - Refuse a non-UTF-8 file before anything is imported, with "Save as CSV UTF-8
    and upload again".
  - Every import offers a **Download sample CSV** in the accepted format.
  - Handle read failures, and block double submit.
  - Owners: `lib/csv/read-file-text.ts`, `components/ui/csv-import.tsx`, the
    import dialogs.
- **FE-204:** free tools silently truncate at 200,000 characters. Refuse with
  the existing "Input exceeds" error.
- **FE-108:** "Add draft fact" clears the form only after the request succeeds.
- **FE-110:** metered shopping-prompt generation shows the refusal reason and
  sends an idempotency key.
- **Done when:** component tests cover the Windows-1252 file, the sample
  download and the over-limit input.

### d. PR 28: Small UI correctness (decided)
- **FE-006:** upload "processing" completion compares the browser clock with the
  server clock. Use server times.
- **FE-009:** warn before discarding unsaved Agent page edits, on navigation and
  on tab close.
- **FE-113:** choose API key expiry in the display time zone.
- **FE-203:** format date-only buckets as dates, not instants.
- **FE-206:** each outdated source gets its own "confirm sink filter" mutation
  state.
- **FE-207:** Copy reports failure when the clipboard write fails.
- **FE-107:** remove the locale-dependent formatting that causes hydration
  mismatches in the marketing islands.
- **FE-112:** expose docs-search keyboard navigation to assistive technology.
- **FE-303:** "View in Sources" passes the run that Visibility reads.
- **FE-304:** "Rotate token" gets its own error and action, outside the Connect
  dialog.

---

## 9. Performance and capacity

The PRs run in parallel. PR 30 adds a migration: merge it after Spec 3's
migrations, renumbering if needed.

### a. PR 29: AI Traffic exports and reads (decided)
- **PERF-002:** exports hold up to 100,001 rows in several copies on a 512 MiB
  instance, and an over-cap export loads everything before refusing.
  - Count first and refuse over the cap.
  - Stream rows to the response (`http/table-export.ts`, `crawl-logs/reads.ts`,
    `ai-traffic/pages.ts`).
- **PERF-003:** the Pages read aggregates the whole window and a `jsonb_agg(id)`
  that is never used. Page in SQL and drop the aggregate
  (`ai-traffic/pages-data.ts`).
- **Done when:** a 100k-row export stays within a memory bound in a test.

### b. PR 30: Indexes and constraints
- **DB-004:** project deletion scans whole tables per deleted crawl or audit.
  Index the SET NULL references.
- **DB-005:** add a `consumable_ledger (workspace_id, …)` index.
- **DB-006:** add a referral events `(workspace_id, occurred_at)` index.
- **DB-011:** drop the 5 redundant indexes, and make the queue claim indexes
  partial on claimable statuses.
- **DB-009:** add status CHECKs on the billing status columns, and a unique
  `provider_attempts` attempt slot like its sibling tables.
- **Done when:** `EXPLAIN` in tests shows index use for each query.

### c. PR 31: Runtime capacity (decided)
- **PERF-004 (+ARC-007):** the API inherits the runner's 4-connection pool. Give
  it its own pool size in config.
- **PERF-001:** the narrowing-glob compile cache never hits. Fix the cache key,
  and validate globs at admission (`site-health/frontier.ts`,
  `url-admission.ts`).
- **PERF-008:** Search Intelligence recounts a dataset after every page. Count
  once.
- **PERF-010:** parse sitemap XML and logo-page HTML off the event loop.

---

## 10. CI, tests and dependencies

The PRs run in parallel. The owner's ruleset should require PR 32's aggregate
check name once it lands (Spec 1, item d).

### a. PR 32: CI selection, speed and flake handling
- **QA-001:** the change classifier skips the API suite when a frontend file the
  API reads changes. Add relation tests for `isApiService` inputs.
- **QA-002:** the E2E path map leaves 3 specs unreachable and under-selects
  specs for fixture changes (`scripts/e2e-paths.json`).
- **QA-003:** a marketing E2E test flakes in about half of passing runs, hidden
  by `retries: 1`. Fix the test, keep traces on the first failure, and fail CI on
  first-attempt flakes.
- **QA-009:** split the API shards and use all runner cores in the frontend
  shards.
- **QA-012:** run the production Worker CSP and consent browser suite in CI.
- **QA-013:** measure API coverage, as `DEVELOPMENT.md` says.
- **DEP-004 (+OPS-014):** run CI Postgres on the production image family
  (`postgres:16-bookworm`), not `16-alpine`.
- **Done when:** classifier unit tests per path pass, and CI wall time does not
  regress.

### b. PR 33: Test hygiene
- **QA-005:** extend the registry-driven cross-workspace test to the about 40
  ID-bearing routes outside `/projects/{project_id}`.
- **QA-006:** test the Razorpay webhook secret-rotation window.
- **QA-007:** scope the recovery and claim calls in API tests to the test's
  queue.
- **QA-010:** rewrite the absence-only tests to assert behaviour.
- **QA-011:** add the DataForSEO names and other secret names to the inherited
  credential denylist.

### c. PR 34: Dependency hygiene
- **DEP-001:** regenerate the licence inventory, including the API runtime tree.
- **DEP-002:** drop stale build-script allowlist entries.
- **DEP-003:** remove the dead `postcss` and `sharp` overrides.
- **DEP-005:** pin the PostgreSQL image by tag plus digest, so Dependabot
  resolves the right family.

---

## 11. Architecture and code quality

- **Depends on:** Specs 4–8 having merged in the touched modules. These PRs are
  cross-cutting and would otherwise conflict.
- The PRs run in parallel with each other.

### a. PR 35: Project inputs through the command layer (decided)
- **BE-301 (+ARC-002):** every project-editor save deletes and re-inserts the
  competitors and domains, so IDs change and logos are lost.
  - Write a diff through `commands/competitors.ts`.
  - Owners: `projects/service.ts`, `projects/competitors.ts`.
- **BE-303:** the request schemas admit 1024-character aliases and domains for
  `varchar(255)` columns. Cap them at 255, so the API returns 422.
- **BE-306:** response contracts are checked only at compile time. Parse
  responses against their schemas in tests, so spread database rows cannot leak
  undeclared columns.
- **Contract drift:** the `routes/demand-contracts.ts` `signals` field is
  optional while the shared `demandSnapshotSchema` requires it.
- **Done when:** saving the project editor twice keeps competitor IDs.

### b. PR 36: Error, retry and stream primitives
- **CQ-001:** machine reasons travel in `message`. Move them to `code` per
  `docs/api-error-contract.md`, and stop the frontend regex matching.
- **CQ-013:** SQLSTATE classification only in `db/errors.ts`.
- **CQ-007:** one `Retry-After` parser.
- **CQ-006:** one SSE tail behaviour for malformed `Last-Event-ID` and
  backpressure.
- **BE-950:** `canonicalJson` throws on non-JSON values (`undefined`, `Date`,
  `Map`, `Set`) without changing any byte it emits today.

### c. PR 37: Config, policy and dead code
- **CQ-003:** about 115 config keys are never read. Wire them, or delete them
  and their literals.
- **ARC-005:** frontend copies of API policy values come from the server
  mechanism.
- **ARC-006:** move inline policy to its config owner.
- **CQ-008:** each billing vocabulary is declared once.
- **CQ-010:** delete the unused API-client methods.
- **CQ-011, CQ-012:** fix documentation and comment drift, and delete leftovers
  (`'use client'`, `action_surface`).

### d. PR 38: Quality gates
- **ARC-003:** add a table-writer allowlist gate in `scripts/quality.mjs`, so a
  second writer of an owned table fails.
- **ARC-008:** the route-ownership gate detects a route family served by two
  modules.
- **CQ-009:** extend the duplication and complexity ratchets to the API service,
  with a baseline of today's 148 functions over the ceiling.

---

## Owner decisions (2026-11-12)

Recorded from the owner's answers in the audit follow-up conversation of
2026-11-12. They are scoped to this plan.

| # | Decision | Findings |
|---|---|---|
| AR-1 | An unset or unknown `APP_ENV` refuses startup | OPS-011 |
| AR-2 | Dev-only seed and reset scripts leave the tracked repository for a git-ignored local folder; the guard redesign stays open (O-3) | OPS-002, BE-705 |
| AR-3 | Abuse budgets key on IPv6 /64 (/56 for registration), with a global login-failure ceiling; Turnstile on login after 5 failures; a separate anonymous MCP registration pool | SEC-001, SEC-002 |
| AR-4 | Agent reply links to unknown hosts open a confirm showing the full URL; known hosts open directly | SEC-007 |
| AR-5 | Owned and competitor domains are platform-aware: shared-platform hosts are kept whole | BE-702 |
| AR-6 | Brand matching joins words only through configured aliases; names under 3 characters are "not assessable" on cited pages | BE-402, BE-901 |
| AR-7 | Controls a role lacks are hidden, not disabled | FE-102 |
| AR-8 | The browser matrix rises to Chrome/Edge 120, Safari/iOS 17.4 and Samsung 25, with an update notice | FE-001 |
| AR-9 | Non-UTF-8 imports are refused with guidance, and every import offers a sample CSV download | FE-008 |
| AR-10 | `GET /health` returns a constant body without the origin token, for the HTTP liveness probe and the uptime check; every other path, `/ready` included, still requires it (owner, 2026-11-12, PR 9 conversation) | OPS-005, OPS-017 |
| AR-11 | The API complexity and duplication ratchets do not measure `services/api/src/generated/`: kysely-codegen writes it and `db:types:check` verifies it, so no one maintains it by hand. Nothing else is exempt (owner, 2026-11-13, billing system-review conversation) | — |

The owner also decided, and recorded where the work lives:
- **Site Health crawling and issue tracking (Spec 5):** SH-B1 to SH-B13, in the
  [Site Health crawl plan](site-health-baseline-crawls.md#owner-decisions-2026-11-12).
- **The billing owner after an ownership transfer** is
  [backlog](backlog.md#billing-and-entitlements) tier 2.
- **`main` ruleset:** set by the owner (Spec 1, item d).

## Open owner decisions

These are not authorized for execution until the owner decides.

- **O-1, database VM protection (OPS-001):** a routine Terraform change, for
  example to `GCP_ZONE`, replaces the PostgreSQL VM and its auto-delete boot
  disk, so all data is lost in a deploy that still goes green. Options:
  - (a) Move the data to a separate persistent disk with `auto_delete = false`,
    plus `prevent_destroy`, `deletion_protection` and a plan gate that fails on
    replacement. This needs one maintenance window.
  - (b) The locks and the plan gate only.
  - (c) No change.
- **O-2, backups (OPS-016):** there are none today, an accepted risk in
  `GOOGLE_CLOUD.md`. The backlog's "Recovery objectives, backup and deletion
  protections" item covers this. Options:
  - (a) A daily snapshot schedule on the data disk with 7-day retention.
  - (b) A nightly `pg_dump` to GCS with 14-day lifecycle.
  - (c) Keep the accepted risk until customers.
- **O-3, how local tooling decides a database is local (OPS-002):** after PR 2
  the scripts are local-only, but they still accept "loopback plus development
  `APP_ENV`", which the production IAP tunnel also satisfies. Options:
  - (a) An explicit local marker row, with per-run seed passwords.
  - (b) A `--local` flag plus typing the database name to confirm.
  - (c) No change.

## Not planned

These are accepted risks, owner-decided designs or Informational observations
with no action:
- **SEC-004:** per-email lockout is the documented design. AR-3 restores the
  per-network brake.
- **SEC-005:** the origin signature does not cover the body.
- **SEC-006:** one JWT secret for several purposes; there is no cross-type
  forgery.
- **SEC-101:** MCP in-band confirmation is the owner design (D4.2/D4.4).
- **DEP-006:** release-age quarantine is a maintainer decision.
- **DEP-007:** the Vite+ alias.
- **DEP-009:** beta provider APIs.
- **ARC-009:** the documented scaling ceilings.
- **DB-010:** evidence retention is the backlog's retention work.
- **PERF-011:** minor observations.
