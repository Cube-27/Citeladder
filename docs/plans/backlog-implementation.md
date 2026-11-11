# Backlog implementation

Status: planned, 11 November 2026. This is tier 1 of the [backlog](backlog.md):
the work the owner chose to build when closing the backlog
([decisions BL1–BL12](../decisions.md#backlog-closure)). It replaces the
priority backlog for Agent verified completion.

## How to run it

The work is split into six **tracks**. Tracks touch disjoint files and can run
in parallel, one agent or branch per track. Inside a track, PRs run in the order
listed when they say **after**; PRs without an **after** can start at once. UI
and UX work comes first (BL1): start tracks U and W before anything else if
capacity is short.

| Track | Scope | PRs | Order inside the track |
|---|---|---|---|
| U | App UI and UX | U1, U2 | Parallel |
| W | Public site | W1, W2 | W1, then W2 |
| A | Agent verified completion | A1–A5 | A1 and A3 in parallel; A2 after A1; A4 after A1; A5 after A2 |
| E | Element evidence | E1 | Alone; A4 consumes it |
| S | Site Health crawling | S1, S2 | S1, then S2 |
| P | Platform and security | P1, P2, P3 | Parallel |

**Shared files.** A few files are touched by more than one track. Whoever merges
second rebases; each overlap is a few lines:

- `services/api/src/workers/runner.ts`: S1 and P2 each register a periodic owner.
- `services/api/src/site-health/planner.ts`: S1, S2 and P1.
- `services/api/src/opportunities/reads.ts`: U2 and A4.

**Every PR.** Follow [CLAUDE.md](../../CLAUDE.md): schema changes are new
forward migrations from `0021_` on (renumber at merge if another PR took the
number); persistence changes get real-PostgreSQL coverage including workspace
isolation; run only the focused tests (`pnpm test:api <files>`) and let CI run
the rest; update only the owner documents whose behaviour changed. Paths below
are relative to `frontend/`.

## Track U: app UI and UX

### U1: AI Traffic filter band fits one row

Crawlers, Activity and Pages put Range, Filter, Folder and (Activity) Status
code or (Pages) Sort in the control band. At 982px the band wraps to 89px
against the product's 49.

- Keep Range inline. Move Folder, Status code and every option in today's
  Filter menu into the shared **All filters** menu (`components/ui/all-filters.tsx`,
  the AS8 pattern used by AI visibility and Actions) at the right of the tabs
  row. Pages' Sort moves to the table toolbar, like Sources' Domains/URLs switch.
- Files: `components/ai-traffic/traffic-controls.tsx`, `ai-traffic-screen.tsx`.
- Add `/ai-traffic?tab=crawlers`, `?tab=activity` and `?tab=pages` to
  `e2e/geometry-census.spec.ts`, which also brings `FilterField` under the
  census.
- Done when the band is one 49px row at 982px and 1280px and the census covers
  the three tabs.

### U2: Faster project switcher and command center

- **Slim switcher list.** `GET` projects returns full project views
  (`services/api/src/projects/service.ts:158-170`, `selectAll`). Add a slim list
  shape with only what the switcher shows, and use it in
  `components/layout/project-switcher.tsx` and `lib/api/projects.ts`, with its
  own query key in the contracts package.
- **Command-center lookup.** `projects/command-center.ts:50-52` reads `audits`
  with `selectAll()`; select only the comparable-audit columns. It also reads
  `opportunity_orders` twice (command-center `:373-378` and
  `opportunities/reads.ts:137-141`); read it once and pass it through.
- Done when the switcher's request carries no full project views and the
  command center issues one `opportunity_orders` read (assert on the response
  shape and the read count in the API test).

## Track W: public site

### W1: Blog illustrations on palette tokens

Five blog illustrations carry 182 raw-colour findings, held by the `svg-color`
baseline in `scripts/design-system-baseline.json` (article-audit 46,
article-connect 59, article-internal-links 18, article-playbook 37,
article-prompts 22). Move them onto palette tokens so they follow light and dark
themes, and empty those baseline entries. No copy changes.

### W2: Per-page stylesheets

**After W1.** `apps/marketing/src/layouts/MarketingLayout.astro:21-27` loads
marketing.css, site.css (3,666 lines), screens.css and layers.css (5,233 lines
in total) on every page. Keep the shared base global and move page- and
section-specific rules next to the pages and components that use them, so each
page ships only its own CSS. Touches the layout, the four stylesheets, the
pages and components that use them, and `astro.config.mjs` if bundling needs it.
Done when every page renders unchanged and no page loads another page's rules.

## Track A: Agent verified completion

The Agent should carry work from an observed issue to a verified improvement,
with evidence at every step. A1–A3 are bugs confirmed on main on 11 November
2026. A4 and A5 are BL2–BL4.

### A1: Declaration ordering

- `declareAction` (`services/api/src/opportunities/declarations.ts:260-269`)
  takes the newest snapshot regardless of `declared_implemented_at`. Select the
  newest snapshot at or before the declared time. When none exists, record the
  baseline as unavailable (null audit and snapshot id) instead of the 409 "No
  current opportunity snapshot".
- A recrawl that resolves the finding empties the Action's members
  (`opportunities/action-sync.ts:211-236`), so a later declaration is refused
  ("No current finding targets this Action", `declarations.ts:259`) and the UI
  hides the button (`isDeclarable` in `components/agent/action-declaration.tsx:233-235`).
  Keep the last non-empty member set (forward migration), declare against it,
  and record the outcome as resolved by the first crawl after deployment, or as
  resolved before the declared deployment, never credited to it.
- Real-PostgreSQL coverage for both, including workspace isolation.

### A2: Documents link to the page they name

**After A1** (both edit `action-declaration.tsx`).

- Every document inherits the chat's Action (`agent/outputs.ts:125`, `:239`),
  and `attachAgentTarget` (`agent/target-adapter.ts:10`) returns early, so the
  page a document names is ignored.
- Add `POST /api/v1/.../agent/.../outputs/{output_id}/target` in
  `routes/agent.ts`. In the adapter, a named target that resolves to a different
  Action re-attaches the output.
- Replace the passive "Name the page or topic…" caption
  (`action-declaration.tsx:253-258`) with a choice: "Link to /x" or "Keep with
  this Action".

### A3: Agent small fixes

Can start at once.

- **Section drafts.** Drafts are `useState` inside `SectionEditor`
  (`components/agent/output-canvas.tsx:222`), so switching revision or document
  drops them. Keep them per document, revision and section until saved or
  discarded (a pane-level store keyed `outputId:revisionId:section`).
- **Skill label.** The composer's skill trigger
  (`components/agent/skill-picker.tsx:75-78`) cannot shrink; truncate it so it
  fits at 390px.
- **Mid-turn crawl reads.** `selectCrawl` (`services/api/src/mcp/evidence-site.ts:79-88`)
  defaults to the newest crawl row of any status. Default to the newest
  completed crawl, ordered by completion.

### A4: Issue-family Actions (BL2, BL3)

**After A1**, and after E1 for the reference snippet. Large; split it into a
backend PR and a UI and Agent PR if it grows past one review.

Today only `aeo.*` rules map to Actions (`SITE_ISSUE_TO_OPPORTUNITY_RULE_ID`,
`config/opportunity.ts:393`), and each site issue becomes one Action per page
(`pageGroupKey`, `analysis/opportunities/actions.ts:80,112`).

- **Scope.** A new Action target kind for one Site Health issue family: one rule
  across its affected pages, grouped from `site_issue_catalogs`
  (`site-health/issue-catalog.ts`). Map `web.*` defect rules to it, and only to
  it, so a shared component failing on 179 pages is one Action, not 179.
  Declaration covers the cohort (raise or bypass `IMPLEMENTATION_TARGETS_MAX`
  for this kind, since the cohort is server-derived).
- **Outcome.** The next comparable crawl decides: verified, partially resolved
  (naming the pages still failing), still failing or inconclusive. The Action
  shows the original crawl revision and cohort.
- **Agent.** "Work with the agent" on a family Action gives the chat the rule,
  the cohort's page list and count, and E1's reference snippet, so the Agent
  writes one fix for the shared component without reading each page.
- **List.** Family Actions appear in the grouped Actions list (`fix_site`
  group) with their page count.
- Files: `config/opportunity.ts`, `analysis/opportunities/detectors.ts`,
  `analysis/opportunities/actions.ts`, `opportunities/action-sync.ts`,
  `opportunities/declarations.ts`, verification, contracts `actions.ts`,
  `components/agent/actions-screen.tsx` and `action-queue.tsx`, the Action page,
  and the Agent's Action context; a forward migration for the target kind and
  cohort.

### A5: Developer handoff (BL4)

**After A2.**

- "Prepare developer ticket" on an Action, built on `lib/agent/handoff.ts`: the
  issue, the affected pages or family, the evidence, the minimal patch and how
  it will be verified, as copyable Markdown.
- A recorded deployment step tied to the Action. Today only
  `declared_implemented_at` exists; record when the fix shipped and by whom, and
  show it on the Action.
- Evidence chips (`lib/agent/evidence.ts`, `components/agent/evidence-chips.tsx`)
  list each record with its date and whether it was observed or inferred. Dates
  come from persisted source metadata, since reads never resolve records.

## Track E: element evidence

### E1: One reference snippet per issue family (BL3)

Today an unnamed control is stored as tag, type, id, name and ordinal only
(`site-health/analysis/accessibility-facts.ts:90-133`).

- While analysing a page, capture a bounded, redacted HTML snippet of the
  failing element and its label context. Strip text content, attribute values
  that can carry personal or secret data (`value`, tokens, emails) and scripts;
  cap the size in `config/site-health/analysis.json`.
- Persist **one** snippet per issue family per crawl (the first affected page in
  a stable order), on the family's catalog row, with the page URL it came from.
  Never one per page.
- Expose it through the Agent's Site Health evidence tool
  (`mcp/evidence-site.ts`) for A4.
- Update [Site Health](../site-health.md), which says no raw HTML is kept.

## Track S: Site Health crawling

### S1: Scheduled crawls (BL5)

- A per-project schedule, off by default, cadence weekly or monthly, on every
  plan. New table and forward migration, modelled on `audit_schedules`
  (`enabled`, `cadence`, `next_run_at`, lease columns, `failure_count`).
- A periodic owner modelled on `AuditScheduler` (`workers/audit-scheduler.ts`),
  registered in `workers/runner.ts`. It claims a due schedule under a lease and
  creates the crawl through the existing `createCrawl` (`site-health/planner.ts:284`),
  so the fetch budget is reserved exactly like a manual crawl. A run is skipped,
  and `next_run_at` advanced, while a crawl is queued or running
  (`crawl_already_active`) or when the budget refuses it.
- Routes for read and update, and a Schedule control beside Start crawl
  (`components/site-health/site-health-screen.tsx`, `CrawlActions`).
- Real-PostgreSQL coverage of claim, skip-while-active and budget refusal.

### S2: Ignore robots.txt (BL6)

**After S1** (both edit the planner and the crawl controls).

- A `robots: 'respect' | 'ignore'` field on `siteCrawlCreateRequestSchema`
  (`packages/contracts/src/site-health-requests.ts:12`), validated in
  `controls()` and frozen in `frozenConfiguration()` (`site-health/planner-policy.ts`).
- The Start crawl control offers "Ignore robots.txt" with a confirmation that
  the person is authorized to crawl this site; the choice and who made it are
  recorded on the crawl. Recrawl and a schedule keep the crawl's choice and show
  it.
- Both robots gates honour the crawl's choice per call:
  `SitePageFetcher.#robotsDenial` (`site-health/page-fetch.ts:109-123`) and the
  `PageAcquirer` gate (`web-evidence/acquisition.ts:256-286`). The fetcher is
  built once per worker, so the choice travels with each fetch request from
  `discover-task.ts` and `analyze-task.ts`.
- Limits: the project's own site crawl only. Competitor, earned-source,
  commerce and page-document fetches stay on Standard handling. Crawl delay,
  rate limits, SSRF protection, page access controls and suppression are
  unchanged; `site_setup` still records the robots snapshot.
- Result presentation marks pages fetched despite a robots exclusion.

## Track P: platform and security

### P1: Operator entitlement (BL9)

- Add an issuable, non-public `operator_controls` entitlement in
  `config/entitlements.json`, following `billing_checkout`, excluded from
  bootstrap grants (`entitlements/bootstrap.ts:154`).
- Replace `hasDevelopmentWorkspace` (`auth/development-access.ts`) in
  `site-health/planner.ts:316` (advanced crawl controls and page limit) and
  `site-health/fetch-budget.ts:41` (unmetered fetches) with that grant.
- Remove `DEV_LOGIN_PASSWORD` from production: the production password policy
  (`config.ts:371-382`), `infra/gcp/locals.tf:22`, and any remaining production
  reads in `billing/config.ts`, `agent/config.ts` and
  `auth/deployment-bootstrap.ts`. Local development keeps the dev login.
- Granting the entitlement to the operator's workspace is an operator step after
  deployment; the PR does not mutate production.

### P2: Security event retention (BL8)

- A periodic prune of `security_events` older than 30 days, in batches, on the
  existing `occurred_at` index. Register it in `workers/runner.ts` like
  `usage-window-cleanup`; retention and batch size go in config.
- Real-PostgreSQL coverage: rows older than 30 days go, newer rows stay.
- Update [Workspace access](../workspace-access.md) with the retention period.

### P3: Cloud cleanup

Inventory current callers before removing anything; the PR changes code and
docs only, and the operator applies it.

- Retire what the runbook already marks obsolete: `ORIGIN_DOMAIN_NAME`,
  `API_DB_POOL_SIZE`, `GCP_PROJECT_NUMBER` (GCP runbook §1.3) and
  `CLOUDFLARE_ORIGIN_CERT/KEY` (§1.4).
- SSH and IAP are retired in the runbook, but the `iap_ssh` firewall
  (`infra/gcp/network.tf:49-63`), the IAP API (`infra/gcp/bootstrap.ps1:75-92`)
  and the GOOGLE_CLOUD.md security contract (`:45-46`) still describe them.
  Remove them if no caller remains.
- Destroy superseded Secret Manager versions in
  `.github/workflows/gcp-deploy.yml:233-277` after a new version is written,
  keeping the previous-version secrets the runtime still reads.
- Narrow IAM in `infra/gcp/identity.tf` to the inventoried callers.
- Update [Google Cloud operations](../operations/GOOGLE_CLOUD.md) and the
  [GCP runbook](../operations/GCP_RUNBOOK.md).

## Done when

All fifteen PRs are merged; A1–A3's bugs are covered by tests; a `web.*` defect
on many pages shows as one family Action that the Agent can fix in one chat and
a later crawl verifies; scheduled and robots-ignoring crawls run through the
existing queue and budget; production no longer carries `DEV_LOGIN_PASSWORD`;
and the owner documents describe what shipped. Then delete this plan and
remove tier 1 from the [backlog](backlog.md).
