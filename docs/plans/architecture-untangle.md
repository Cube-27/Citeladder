# Architecture untangle

Status: approved for implementation (owner, 2026-11-06). This document is both the plan and the
orchestrator's tracker. The work is 22 scoped pull requests (P01–P22). Each PR batches a set of rows
(the commit-level units, e.g. ON1, FX2), lists the PRs it depends on, and carries a status the
implementor and orchestrator keep current.

Sources, all verified against `main` at `f560b2a03` (every cited `path:line` reopened, copy counts re-run,
git evidence checked): an eleven-scope untangle review (hidden links, needless links, surplus, special
cases, shallow modules), a six-area architecture audit (read/write split, queues, tenancy, deployment,
models, cost), the owner's onboarding bug report diagnosed from code and 14 days of Cloud Run logs, and the
owner's decisions below. Findings that did not survive verification are not listed. Paths are relative to
`frontend/services/api/src/` unless they start with `frontend/`, `docs/` or `.github/`.

## How the orchestrator uses this document

1. **Unit of assignment is a PR (P01–P22).** The orchestrator assigns one PR to one implementor. The
   implementor commits row by row in the PR's row order, marks each row `done` in the *Rows* table, sets
   the PR's status and link in the *PR tracker* in its tracker commit, gets CI green and comments
   `READY <sha7>`. The orchestrator merges on READY and updates the PR's status to `merged`.
2. **Ready rule.** A PR is ready when every PR in its *Depends on* column is `merged`. Row dependencies
   inside one PR are satisfied by commit order.
3. **Parallel rule.** Ready PRs may run at the same time; the *Order* section lists which ones can. A PR
   marked **wide** (repo-wide import churn) runs with as few other PRs open as possible and merges first;
   open PRs rebase after it.
4. **Migrations.** PRs marked **mig** may add a forward migration, numbered `0006` onwards in merge order;
   only one **mig** PR is open at a time, or a later one renumbers when it rebases. Never edit an applied
   migration and never reset a database.
5. **Size.** A PR that would pass about 4,000 changed lines splits at a row boundary into `Pnn-a` /
   `Pnn-b`; record the split in *Notes*.
6. **Status values:** `todo` → `in progress` → `in review` → `merged`; `blocked` with a one-line reason in
   *Notes*. Do not add progress notes elsewhere.
7. **Scope.** A PR implements exactly its rows and their detail sections under *Work details*. Anything new
   goes into *Notes* or `docs/plans/backlog.md`, not into the PR.
8. **Every PR** follows `CLAUDE.md` (owner inspection first, focused tests only, Review.md self-check) and
   updates the owner document whose contract it changes. No back-compat shims, no data backfills, version
   constants stay at 1, no new lint or style checks, no marketing copy changes beyond the ones this plan
   names.

## Owner decisions (2026-11-06)

Scoped to this plan. A PR that relies on a billing decision also records it in `docs/billing-decisions.md`.

| # | Question | Decision | Applied in |
|---|----------|----------|------------|
| OD1 | Split `src/analysis`? | Move only its side effects (audit-state transitions, enqueues) into `audits/`; `analysis/` stays the pure derivation layer `docs/backend-architecture.md` describes. | X8 |
| OD2 | Do plan-flag checks take the capacity lock? | Yes; correct `docs/billing-entitlements.md:57`. | B3 |
| OD3 | AI referral classification: persisted or live? | Persisted everywhere; landing and Performance read `referral_classifications`. | X7 |
| OD4 | Trial credits (B16 says 5,000; website says none)? | The trial gets **500** AI credits; the copy is corrected to match. | FX1 |
| OD5 | Onboarding discovery | Fix the recurring "competitor discovery fails after a deploy, works after logging out" bug first; make error handling and logging robust last, with recovery actions instead of dead-end errors. | ON1, ON2, Z1–Z4 |
| OD6 | Unpriced gateway model billed at the Haiku rate | Keep the documented fallback: only Anthropic and OpenAI models are used and all are priced; internal cost for any other model stays at the Haiku rate; customer pricing is separate and the public model choice is fixed. Revisit later. | none |
| OD7 | Referral classifications are kept 90 days but Performance reads up to 480 (raised by P08 #631) | Keep AI referral data for the same period as Performance (480 days), so Performance never counts older AI sessions as not AI. | X9 |
| OD8 | P18's engineering values: $25/day breaker on included and uncharged cost; output caps 16k (prompt generation, research) / 8k (rest) | Keep both (2026-11-07). Recorded as billing decision B68. | K2, K3 |

## PR tracker

| PR | Title | Rows (commit order) | Depends on | Flags | Status | PR link | Notes |
|----|-------|---------------------|-----------|-------|--------|---------|-------|
| P01 | Onboarding competitor discovery fix | ON1, ON2 | — | | merged | [#626](https://github.com/Cube-27/Citeladder/pull/626) | Owner bug |
| P02 | Correctness fixes: trial credits, Share of Shelf, perception states, browser state labels, latest brand run | FX1, FX2, FX3, FX4, O1 | — | mig? | merged | [#629](https://github.com/Cube-27/Citeladder/pull/629) | Migrations 0008, 0009 |
| P03 | Runtime safety and schema hardening | FX5, DB1, DB2 | — | mig | merged | [#627](https://github.com/Cube-27/Citeladder/pull/627) | Migrations 0006, 0007 |
| P04 | Site Health tasks I: outcome classifier, crawl status, single writers | SH1, SH2, SH3 | — | mig? | merged | [#628](https://github.com/Cube-27/Citeladder/pull/628) | No migration needed |
| P05 | Engine surfaces I: DataForSEO client, typed frozen config, engine sets from routes | E1, E2, E3 | — | | merged | [#637](https://github.com/Cube-27/Citeladder/pull/637) | No migration |
| P06 | Browser contracts and prompt/topic descriptors | F1, F2, F3, F4 | — | | merged | [#634](https://github.com/Cube-27/Citeladder/pull/634), [#638](https://github.com/Cube-27/Citeladder/pull/638) | Split for size: P06-a (#634) = F1–F3; P06-b (#638) = F4 |
| P07 | App route manifest and kit cleanup | R1, R2, R3, R5, R6, R7 | — | | merged | [#640](https://github.com/Cube-27/Citeladder/pull/640) | Command palette stays in `components/ui` (design-system policy); see PR |
| P08 | Shared identities and leaf primitives | X1, X2, X3, X7 | — | wide, mig? | merged | [#631](https://github.com/Cube-27/Citeladder/pull/631) | Migration 0010 |
| P09 | Queue owner I: moves, analytics registry, lane descriptor | Q1, Q2, Q3 | P03 | wide | merged | [#630](https://github.com/Cube-27/Citeladder/pull/630) | |
| P10 | Credit holds, plan gate, grant writer, refunds | B1, B2, B3, B4, B5 | P04 | mig? | merged | [#632](https://github.com/Cube-27/Citeladder/pull/632) | Migration 0011 |
| P11 | One prompt write path and project-scoped commands | C1, C2, C5 | P03 | | merged | [#639](https://github.com/Cube-27/Citeladder/pull/639) | No migration |
| P12 | Opportunities: check kinds, typed targets, evidence announcement | O2, O3, O4 | P02 | | merged | [#643](https://github.com/Cube-27/Citeladder/pull/643) | No migration |
| P13 | Browser descriptors II and job states | F5, F6, F7 | P06 | | merged | [#642](https://github.com/Cube-27/Citeladder/pull/642), [#644](https://github.com/Cube-27/Citeladder/pull/644) | Split for size: P13-a (#642) = F5, F6 (F6 alone is one ~5,200-line row); P13-b (#644) = F7 |
| P14 | Marketing site records and config-driven numbers | MK1, MK2, MK3, MK4 | P02 | | merged | [#649](https://github.com/Cube-27/Citeladder/pull/649) | Marketing image now copies `billing.json` and `entitlements.json` |
| P15 | Queue owner II: remaining lanes and coalesced enqueue | Q4, Q5, Q6, Q7, Q8 | P01, P03, P09 | | merged | [#633](https://github.com/Cube-27/Citeladder/pull/633) | No migration |
| P16 | Site Health tasks II: one task runner, counters, pinned versions | SH4, SH5 | P04, P08, P09 | | merged | [#635](https://github.com/Cube-27/Citeladder/pull/635) | No migration |
| P17 | Permission on the command, MCP prepared changes, workspace ownership | C3, C4, X6 | P11 | | merged | [#646](https://github.com/Cube-27/Citeladder/pull/646) | No migration |
| P18 | Internal cost view, spend breaker, output caps | K1, K2, K3 | P01, P10 | mig? | merged | [#645](https://github.com/Cube-27/Citeladder/pull/645) | Migration 0012. Values confirmed by owner (OD8, B68) |
| P19 | Engine surfaces II: surface adapters, audit side effects out of analysis | E4, E5, X8 | P05, P15 | | merged | [#641](https://github.com/Cube-27/Citeladder/pull/641) | No migration. Found the `audit_tasks.error_code` length bug, now P24 |
| P20 | Settings resolve once; named abuse budgets | G1, G2, G3 | P01, P15 | wide | merged | [#650](https://github.com/Cube-27/Citeladder/pull/650) | No migration. Follow-up in PR body: deep readers without config in scope still read `process.env` |
| P21 | Screen sweep: failure renderer, typed blobs, form limits, non-null project, recovery actions | F8, F9, F10, R4, Z4 | P07, P12, P13, P16 | | in review | [#651](https://github.com/Cube-27/Citeladder/pull/651) | Split (~4,440 lines): P21-a = F8, F9, F10 (#651); P21-b = R4, Z4 on branch `claude/p21-b-r4-z4`, opens after P21-a merges |
| P22 | AI Traffic and integration owners; error logging | X4, X5, Z1, Z2, Z3 | P15, P16, P19 | | merged | [#647](https://github.com/Cube-27/Citeladder/pull/647) | No migration |
| P23 | AI referral retention matches the Performance window | X9 | P08 | | merged | [#636](https://github.com/Cube-27/Citeladder/pull/636) | Owner decision OD7 |
| P24 | Audit error codes fit their column | DB3 | P19 | mig | merged | [#648](https://github.com/Cube-27/Citeladder/pull/648) | Migration 0013. Found by P19 |

## Order

- **Start together (no dependencies):** P01, P02, P03, P04, P05, P06, P07, P08 (wide). Suggested first:
  P01 (the owner bug) and P02 (user-visible defects and the trial change), then P03 and P04 because the
  most PRs wait on them.
- **Next, as their dependencies merge:** P09 (after P03), P10 (after P04), P11 (after P03), P12 and P14
  (after P02), P13 (after P06).
- **Then:** P15 (after P01, P03, P09), P16 (after P04, P08, P09), P17 (after P11), P18 (after P01, P10).
- **Then:** P19 (after P05, P15), P20 (after P01, P15), P21 (after P07, P12, P13, P16).
- **Last:** P22 (after P15, P16, P19).

What each merge unblocks:

| Merged | Unblocks (once their other dependencies are merged) |
|--------|-----------------------------------------------------|
| P01 | P15, P18, P20 |
| P02 | P12, P14 |
| P03 | P09, P11, P15 |
| P04 | P10, P16 |
| P05 | P19 |
| P06 | P13 |
| P07 | P21 |
| P08 | P16, P23 |
| P09 | P15, P16 |
| P10 | P18 |
| P11 | P17 |
| P12 | P21 |
| P13 | P21 |
| P15 | P19, P20, P22 |
| P16 | P21, P22 |
| P19 | P22 |

## Rows

Commit-level units. Status: `todo` or `done` (set by the implementor in its PR). *Depends on* is the row
order the PR tracker already respects.

| ID | Row | Depends on | Area | Flags | Status | Commit | Notes |
|----|----|-----------|------|-------|--------|---------|-------|
| ON1 | Discovery identity deadline; no silent empty "ready"; research logging | — | `projects/research*.ts`, `config/discovery.json`, `models/anthropic.ts`, `workers/discovery-worker.ts` | | done | 29c5770 | |
| ON2 | "Run discovery again" and onboarding failure copy | ON1 | `frontend/lib/onboarding`, `frontend/components/onboarding`, `routes/brand-discoveries.ts` | | done | 9c27304 | |
| FX1 | Trial credits 5,000 → 500 and copy | — | `config/entitlements.json`, `docs/billing-*.md`, three marketing copy files | | done | d63ffa9 | |
| FX2 | Commerce Share of Shelf by candidate state; Commerce "measure with" | — | `commerce/shelf*.ts`, `config/actions.ts` | mig? | done | be87f27 | |
| FX3 | Perception: model omissions stay distinct; model frozen per audit | — | `perception/`, `visibility/perception.ts` | mig? | done | 0bdb569 | |
| FX4 | Browser: cancel refreshes Commerce; Internal Links state labels | — | `frontend/components/runs/run-detail-screen.tsx`, `frontend/components/site-health/internal-links-panel.tsx` | | done | fbc7dd6 | |
| FX5 | Runtime safety: in-request cap, SIGTERM, frozen turn limit, failed-call usage, deploy guard | — | `routes/agent.ts`, `agent/{contracts,model-calls}.ts`, `server.ts`, `commands/audits.ts`, `audits/interactive.ts`, `.github/workflows/gcp-deploy.yml` | | done | 81c7fd9 | |
| DB1 | Capacity-lease and queue indexes; lease purge | — | `migrations/`, `providers/capacity.ts`, audit maintenance | mig | done | 9c7848e | |
| DB2 | Tenancy in the schema; registry-driven isolation test | DB1 | `migrations/`, `db/workspace-scope.ts`, writers of `prompt_sets`/`topics`/`competitors`/`brands`/`prompts`, `test/request-access.test.ts` | mig | done | f15ac10 | |
| DB3 | Audit error codes fit `audit_tasks.error_code` | — | `migrations/`, audit error-code list | mig | done | 43ad64e | |
| Q1 | Enqueue and executor contract move to `queue/`; fairness test harness | — | `queue/`, `referrals/enqueue.ts`, `workers/executor.ts` + importers | wide | done | 624694c | |
| Q2 | Analytics task-kind registry | Q1 | `workers/analytics-worker.ts`, `workers/terminal-compensation.ts`, `config/analytics.json` | | done | 5466c82 | |
| Q3 | Lane descriptor: shared claim, cursor, heartbeat, fence; analytics and Site Health lanes | Q1, DB1 | `queue/task-queue.ts`, `queue/recovery.ts`, `queue/next-due.ts` | | done | feea935 | |
| Q4 | Discovery lane on the descriptor | Q3, ON1 | `queue/discovery-queue.ts`, `workers/discovery-worker.ts` | | done | 4db7114 | |
| Q5 | Agent lane on the descriptor | Q3, FX5 | `agent/queue.ts`, `workers/agent-worker.ts` | | done | c401d14 | |
| Q6 | Integrations lane on the descriptor | Q3 | `workers/integration-worker.ts` | | done | c740105 | |
| Q7 | Audit lane on the descriptor | Q4, Q5, Q6 | `queue/audit-queue.ts`, `workers/audit-worker.ts`, `workers/audit-scheduler.ts` | | done | 1b33b90 | |
| Q8 | Coalesced-successor enqueue; AI Traffic trigger through the queue | Q2 | `crawl-logs/{state,insights-enqueue}.ts`, `integrations/projections.ts`, trigger call sites | | done | 4a96045 | |
| SH1 | Site Health task-outcome classifier | — | `site-health/` outcome lists (nine files) | | done | 13423c9 | |
| SH2 | Crawl-status module; dead states and legacy fallbacks deleted | SH1 | `packages/contracts/src/site-health/crawl.ts`, `site-health/`, `frontend/lib/site-health/status.ts` | mig? | done | 86f59ee | |
| SH3 | One writer for crawl tasks, site URLs, observations, memberships | SH2 | `site-health/{admission-writes,frontier,discover-task,planner,site-setup-task,lifecycle,link-metrics}.ts` | | done | 90cc69e | |
| SH4 | One site-task runner (lock, settle, backoff, access check) | SH3, Q3 | `site-health/{site-task,task-fence,analyze-task,discover-task,site-setup-task}.ts`, `workers/site-health-worker.ts` | | done | e292afb | |
| SH5 | Crawl counter chooser; shared commerce-facts schema; pinned versions on reads | SH2, X1 | `site-health/reads/`, `commerce/projection-facts.ts` | | done | 6c7e69f | |
| B1 | Consumable hold module; Site Health fetch budget on it | — | `entitlements/ledger.ts`, `site-health/fetch-budget.ts` | | done | 684e62b | |
| B2 | Metering, prompt runs and Agent funding on the hold module | B1 | `billing/metering.ts`, `audits/prompt-runs.ts`, `agent/funding.ts`, `billing/reads.ts` | | done | e739dd9 | |
| B3 | One plan gate and occupancy counter table | B2 | `entitlements/occupancy.ts`, flag refusal sites, `docs/billing-entitlements.md` | | done | bfb642c | |
| B4 | One grant writer; Site Health runtime projection moves to `site-health/` | B3, SH3 | `entitlements/{grants,bootstrap}.ts`, `billing/settlement.ts`, `site-health/planner.ts` | mig | done | 48eed01 | Migration 0011 |
| B5 | Settlement owns refund consequences; typed grant source | B4 | `billing/{settlement,receipts,recovery}.ts`, `entitlements/grants.ts` | | done | fd11289 | |
| C1 | One prompt insert owner (incl. Commerce) | DB2 | `prompts/{prompts,candidates,locks}.ts`, `commerce/{buyer-prompts,decisions}.ts` | | done | 97776b4 | |
| C2 | Project-scoped commands; public API ownership fails closed | C1, FX5, DB2 | `commands/`, `public-api/ownership.ts`, `mcp/write-tools.ts` | | done | ba98773 | |
| C3 | Permission declared once on the command; one membership check | C2 | `routes/define.ts`, `routes/*` with commands, `commands/`, membership query sites | | done | 8626c1a | |
| C4 | One prepared-change table for MCP dry run and confirm | C2 | `mcp/{write-tools,confirmed-changes,confirmations}.ts`, `auth/security-events.ts` | | done | 498942d | |
| C5 | One `citeladder://` record-kind table; route-declared streaming body | — | `mcp/{links,retrieval}.ts`, `frontend/lib/agent/evidence.ts`, `packages/contracts`, `app.ts`, `routes/crawl-logs.ts`, `routes/define.ts` | | done | 2adce71 | |
| E1 | One DataForSEO envelope client and secret custody | — | `search-intelligence/{live,credentials,acquisition-state}.ts`, `search-surfaces/dataforseo.ts`, `providers/`, `audits/execution-context.ts` | | done | d5ae183 | |
| E2 | Typed frozen audit configuration | E1 | `audits/{freeze,creation,execution-context}.ts`, `analysis/{comparison,provenance}.ts`, `config/audits.json` | | done | 25dc9ce | |
| E3 | Engine sets derived from provider routes; browser engine tables deleted | E2 | `audits/{creation,estimate,submission-intent,maintenance}.ts`, `search-surfaces/locations.ts`, `config/visibility.json`, `frontend/lib/providers/catalog.ts` | | done | ee5dfc3, 23a7ca2 | Two commits: the pre-commit hook's command line overflows on Windows at 61 files |
| E4 | `llm` surface adapter; audit worker moves to `audits/` | E3, Q7 | `audits/surfaces/`, `workers/audit-worker.ts`, `audits/{result,surface}-persistence.ts` | | done | 5b91c3e | |
| E5 | `search_ai` and `llm_scraper` adapters | E4 | `audits/surfaces/`, `search-surfaces/` | | done | 666c374 | |
| O1 | One latest-brand-run resolver; one rate owner; queries-per-execution denominator | — | `visibility/{selection,dashboard,prompts}.ts`, `opportunities/sources.ts`, `projects/command-center.ts`, `analysis/aggregate.ts` | | done | fb22e46 | |
| O2 | One module per check kind | O1, FX2 | `opportunities/{declaration-checks,declarations,verification-evidence,declaration-view}.ts`, `config/actions.ts`, rule catalog | | done | 1d0a02c | |
| O3 | Typed Action targets and producer registry | O2 | `opportunities/refresh*.ts`, `analysis/opportunities/`, `visibility/{sources,page-standing}.ts` | | done | ebb73bb | |
| O4 | One evidence announcement for refresh and verification | O3 | `opportunities/verification.ts`, `source-pages/inspector.ts`, `search-intelligence/acquisition-state.ts`, `traffic/snapshot.ts`, `site-health/terminal-handoff.ts` | | done | e38b60c | |
| F1 | Contracts own request schemas: prompts, topics, runs, actions, projects | — | `frontend/packages/contracts`, `frontend/lib/api/{prompts,topics,runs,actions,projects}.ts`, matching server `inputs.ts` | | done | 6c54919 | |
| F2 | Contracts own remaining request schemas; delete `lib/api/types.ts` | F1 | `frontend/packages/contracts`, `frontend/lib/api/` | | done | 5bae2b9 | |
| F3 | One Search Intelligence dataset-kind table | F2 | `routes/search-intelligence-contracts.ts`, `search-intelligence/acquisition-state.ts`, `frontend/lib/config/search-intelligence.ts`, contracts | | done | 1052e86 | |
| F4 | Query and mutation descriptors: prompts and topics (shared scoped-key builder) | F1 | `frontend/lib/api/{prompts,topics,query-keys}.ts`, `frontend/components/{prompts,knowledge-base}` | | done | 3ab383a | P06-b |
| F5 | Query and mutation descriptors: runs, visibility, commerce | F4 | `frontend/lib/api/{runs,visibility,commerce}.ts`, matching components, `frontend/lib/navigation/route-prefetch.ts` | | done | fd1c538 | P13-a |
| F6 | Query and mutation descriptors: integrations and remaining domains | F5, F2 | `frontend/lib/api/*`, remaining components | | done | a6cc2f0 | P13-a |
| F7 | Job-state records and one polling helper; one score band | F6 | `frontend/lib/<domain>/status.ts`, job screens, `frontend/lib/config/operational.ts` | | done | 18b6074 | P13-b |
| F8 | One failure renderer | F7 | `frontend/components/*` error sites, `frontend/components/ui/mutation-notice.tsx` | | done | 9d3feca | |
| F9 | Typed evidence and summary blobs per domain | F8, SH5, O3 | `frontend/packages/contracts`, `frontend/lib/{site-health,demand}`, `frontend/packages/mcp-app` | | done | eb8c42f | Per-page Site Health rule evidence (`FACTS_BY_RULE`) still untyped |
| F10 | Server bounds travel on the form-opening read | F9 | `frontend/lib/config/{prompts,operational,agent}.ts`, matching server reads | | done | d61da2d | |
| R1 | Delete kit components with no production consumer | — | `frontend/components/ui/`, `docs/frontend-architecture.md`, `docs/decisions.md` | | done | 79b3722 | |
| R2 | App route manifest drives nav, titles, scope and router | R1 | `frontend/lib/navigation/`, `frontend/components/layout/`, `frontend/apps/app/src/router.tsx`, `frontend/lib/project/bootstrap.ts` | | done | d36f893 | |
| R3 | Router imports screens directly; pass-through route files deleted | R2 | `frontend/apps/app/src/product-routes-*.tsx`, `*-route-content.tsx`, `pricing-route.tsx` | | done | 41ae02d | |
| R4 | Gate hands project screens a non-null project scope | R2, F6 | `frontend/components/layout/onboarding-gate.tsx`, project screens | | todo | | |
| R5 | Organism moves remove `ui`↔`layout`↔`agent` import cycles | R3 | `frontend/components/{ui,layout,agent}` | | done | 87d6e7b | |
| R6 | App Worker reads reserved paths from the route-ownership contract | — | `frontend/apps/app/worker.ts` | | done | 5657ada | |
| R7 | Chart height is a role, not a pixel prop | R1 | `frontend/components/ui/trend-chart.tsx`, chart callers | | done | dc2605e | |
| MK1 | Marketing page records carry `updated` and drive sitemap `lastmod`; delete `CompareTable` | — | `frontend/apps/marketing/src/public-routes.ts`, `frontend/lib/marketing-content/`, `frontend/components/marketing/` | | done | 640a3ab | |
| MK2 | Records drive legal and research routes | MK1 | `frontend/apps/marketing/src/pages/`, `frontend/lib/marketing-content/legal.ts` | | done | 04a3a2b | |
| MK3 | Screen catalogue is the only module-to-image map | — | `frontend/components/marketing/{landing-page,commercial-page}.tsx`, `ResearchLayout.astro` | | done | c2edb2c | |
| MK4 | Trial and free-tool numbers interpolated from config | FX1, MK1, MK3 | `frontend/components/marketing/pages/{pricing-catalog,pricing,landing-page}.tsx`, tools pages | | done | c84c7e4 | |
| G1 | Settings engine to a leaf; cross-owner aliases, dead key and import cycle removed | — | `config.ts`, `config/settings.ts`, `billing/config.ts`, alias importers | wide | done | 9a09b23 | |
| G2 | Settings resolve once from one environment | G1, Q7, ON1 | `config.ts`, `configEnvironment` callers (18), `config/execution.ts` | wide | done | a1cdef0 | Deep readers with no config in reach still pass `process.env`; threading `config.settings` through billing, entitlements and prompt pipelines is a follow-up |
| G3 | Named abuse budgets | G1 | `abuse/usage.ts`, `config/abuse.ts`, budget call sites | | done | 07df0aa | |
| X1 | One citation and Commerce URL identity; differentiation reports insert-only | — | `source-pages/{identity,sync,inspector,differentiation}.ts`, `site-health/url-identity.ts`, `config/source-pages.ts`, `analysis/domains.ts`, `commerce/{projection-facts,projection}.ts` | mig? | done | aee742f, bdd21a8 | |
| X2 | Leaf primitives move to the bottom | X1 | `analysis/round.ts`, casefold/canonical-JSON/calendar-day copies, `projects/safe-fetch.ts`, `billing/pdf.ts`, `billing/contracts.ts` + importers | wide | done | fcc2f84 | |
| X3 | One page-identity module (path, landing page) | X1 | `traffic/normalization.ts`, `integrations/`, `crawl-logs/`, `referrals/` identity helpers | | done | 9ac7046 | |
| X4 | AI Traffic composition gets its own module | Q8 | `crawl-logs/{pages,pages-data,insights,overview,citation-runs}.ts` | | done | fd533ba | |
| X5 | Integration lifecycle and reporting timezone move to their owners | Q6, Q8 | `routes/integrations.ts`, `integrations/`, `workers/integration-worker.ts`, `crawl-logs/state.ts` | | done | fdb4b7a | |
| X6 | Auth/workspaces placement; one "owned workspace" query | C3 | `auth/bootstrap.ts`, `auth/development-access.ts`, `workspaces/`, `entitlements/bootstrap.ts` | | done | 03c2138 | |
| X7 | AI referral classification read from the persisted table everywhere | X3 | `referrals/landing.ts`, `traffic/projection.ts` | | done | eda2c70 | |
| X8 | Audit side effects leave `src/analysis` | E4 | `analysis/{finalization,execution}.ts`, `audits/` | | done | 61fd008 | |
| X9 | AI referral retention matches the Performance window (OD7) | X7 | `config/referrals.json`, `referrals/retention.ts` | | done | f41aa57, fe5b864 | |
| K1 | One internal-cost view; Tavily and Keenable priced; cost rows in the call's transaction | B2 | `billing/metering.ts`, `audits/costs.ts`, `config/{costs,ai-credits}.json`, `commerce/discovery-provider.ts`, `projects/research-evidence.ts` | mig? | done | b32d164 | Before public sign-up |
| K2 | Platform-wide daily spend breaker | K1 | `billing/metering.ts`, config | | done | 2e85ef3 | Before public sign-up |
| K3 | Per-feature output caps for charged calls | B2, ON1 | `config/model-gateway.json`, `billing/metering.ts`, gateway callers | | done | 41eab73 | |
| Z1 | Lane failure and lease-loss logs in the queue owner | Q7 | `queue/`, `workers/start-runner.ts` | | done | 489c976 | |
| Z2 | Silent-catch triage: Site Health | SH4 | `site-health/` | | done | 80961f8 | |
| Z3 | Silent-catch triage: remaining backend areas | Z1, X5, E5 | `crawl-logs`, `commerce`, `search-intelligence`, `projects`, `providers`, `integrations`, `auth`, `audits`, `web-evidence`, `source-pages` | | done | 31e496b | providers, integrations: no change needed |
| Z4 | Recovery actions on job-backed screens | F8 | job-backed screens | | todo | | |


## Work details

Each section lists, per PR: the change, the evidence it removes, and the tests that protect it. Tests that
involve leases, claims, locks or concurrency run at the real PostgreSQL boundary (`pnpm test:api <files>`).

### ON. Onboarding competitor discovery (owner bug)

Diagnosis. The brand-identity model call has a fixed 40 s cap the config also clamps
(`config/discovery.json:61-66`, default 40, maximum 40; gateway built with `attempts: 1` at
`projects/research.ts:270-277`). Observed identity latency on Haiku is 20–38 s. The 2026-11-02 failure was
the first discovery on a new revision: `brand_discovery.model_call_failed phase=identity reason=connection
elapsed_ms=40101`; the rerun a minute later took 29.6 s. A timed-out identity becomes `null`
(`research.ts:133-146`), `suggestCompetitors` returns `[]` at once (`research.ts:172`) and the worker saves a
`ready` row with no competitors and the `research_degraded` / `competitors_not_found` warnings, so every
`/run` call still returns 200. The discovery id is pinned in the URL
(`frontend/lib/onboarding/onboarding-flow.ts:103,306-313`), the hook's `retry` only re-sends a failed request
(`frontend/lib/onboarding/use-brand-discovery.ts:43-46,108-116`) and `claim()` never re-claims a finished task
(`queue/discovery-queue.ts:35`), so only logging out (which drops the id and creates a new discovery) gets a
fresh run. The deploy correlation is timing, not cold start. PR #386 already raised the cap 20 → 40 s.

- **ON1** (backend)
  - The identity phase gets its own deadline sized to observed latency (about 90 s) drawn from the
    remaining interactive budget; the competitor phase gets what is left, so identity plus competitors fit
    under the 180 s interactive abort. Lift the 40 s clamp. Size the identity request's `max_tokens` for
    the call instead of the Agent's 64,000.
  - A timed-out or failed identity is never saved as a quiet `ready`: retry within the task's existing
    `max_attempts` (3) or settle with a distinct failure code the UI can act on.
  - Logging in this flow: `models/anthropic.ts:45-46` maps a deadline abort to `connection`; add a distinct
    `timeout` code. `projects/research.ts:27-33` logs every non-`ModelError` (credit refusal, identity
    validation) as `unusable_answer`; carry the real class and code. Log instead of swallowing at
    `research.ts:280` (gateway construction), `:320` (competitor search) and
    `projects/research-evidence.ts:291-296` (identity searches). `workers/discovery-worker.ts:118` logs lease
    loss; `:119-123` logs class, phase and elapsed time with the code.
  - Move the hard-coded evidence confidence `0.9 : 0.7` (`research.ts:349`) into `config/discovery.json`.
  - Tests: `test/project-research.test.ts` with the real `createModelGateway` and an injected transport whose
    identity reply is slower than 40 s but inside the new budget (fake clock): competitors returned,
    warnings empty. `test/discovery.test.ts` (PostgreSQL): an identity timeout ends in retry or the distinct
    failure, never `ready` with no competitors.
- **ON2** (rerun)
  - "Run discovery again" whenever the status is `failed` or warnings include `research_degraded` /
    `competitors_not_found`. Create a new discovery from the same input with a fresh idempotency key (daily
    admission applies) and replace the URL-pinned id with the new one; do not reset a finished task.
  - `frontend/components/onboarding/onboarding-stages.tsx:142-155` tells a `brand_discovery_failed` user the
    website could not be confirmed and offers only "Edit website"; correct the message and add the rerun
    (owner-authorized copy change). The degraded callouts (`:136-140`) get the same action.
  - Tests: discovery rerun is workspace-isolated (PostgreSQL); a degraded or failed discovery renders the
    action and clicking it starts a new run (component test).

### FX. Correctness fixes

- **FX1 — trial credits (OD4).** Set `config/entitlements.json` `public_trial.grants.ai_credits` to 500.
  Add a B-entry amending B16 to `docs/billing-decisions.md`; update `docs/billing-entitlements.md` and any
  launch config, fixture or test that restates 5,000 for the trial (search `public_trial` with `5000` /
  `5,000`). Copy at `frontend/components/marketing/pages/pricing-catalog.tsx:246` (`TRIAL_EXCLUSIONS`),
  `pricing.tsx:25` and `frontend/lib/marketing-content/faq.ts:139` says the trial includes 500 AI credits
  and that Agent access is not included; nothing else in those strings changes. Test:
  `self-serve-trial.test.ts` asserts the 500 grant.
- **FX2 — Commerce Share of Shelf.** `commerce/shelf.ts:102-113` `findOrCreateCandidate` returns any
  candidate regardless of `state`, `:162` classifies the observation as `ai_observed_competitor`, and
  `commerce/shelf-metrics.ts:31-35,78` counts it as a slot holder, so pending and rejected candidates enter
  the denominator, against `docs/commerce-intelligence.md:81-82`. Only approved candidates hold slots;
  pending AI-observed ones get their own class outside the share; rejected ones are excluded. Record the
  resolver outcome (`not_needed | failed | unavailable`) and the resolver template version per observation
  (`commerce/shelf-parsing.ts:217-223` swallows resolver errors and records `model: ''` for both "failed"
  and "nothing to resolve"; invariant 9). In the same PR, `config/actions.ts:173` stops promising "next
  visibility run" for Commerce Actions, for which no check is frozen
  (`opportunities/declaration-checks.ts:132-143`, `docs/opportunities.md:190-194`). Tests:
  `shelfMetrics` with pending, approved and rejected candidates; a resolver failure recorded as `failed`.
- **FX3 — perception states.** An entity the model left out becomes `not_assessable`
  (`perception/validate.ts:139-152`), folded into real judgements at `perception/metrics.ts:77`; an omitted
  claim becomes `not_covered` (`perception/verify.ts:185-197`), the same verdict as "no fact covers it"
  (`perception/fact-metrics.ts:84-88`). Persist `model_omitted` per entity and per claim and exclude it from
  the judged denominators (invariant 7). Freeze the perception model with the extractor/template/metrics
  versions (`perception/admission.ts:62-75`) and include it in the comparison key
  (`visibility/perception.ts:95`). Tests on `validate`, `verify` and the metrics denominators.
- **FX4 — browser state defects.** `frontend/components/runs/run-detail-screen.tsx:54-63` invalidates
  Visibility but not Commerce after a cancel; iterate `AUDIT_RESULT_QUERY_ROOTS`
  (`frontend/lib/api/query-keys.ts:71-76`). `frontend/components/site-health/internal-links-panel.tsx:37-46`
  shows `unavailable` as "Failed" and `queued` as "Running"; give each state its own label. Component
  tests assert the refreshed Commerce read and each label.
- **FX5 — runtime safety.**
  - In-request work has no per-instance limit: Agent turns run up to 1,800 s inside the request
    (`routes/agent.ts:166-173`, `config/agent-runtime.json:40`), `runAudit` drives up to 240 s
    (`commands/audits.ts:41-46`, `audits/interactive.ts:24-41`) on 1 vCPU, concurrency 40 and a pool of 4
    (`infra/gcp/run.tf:19-25,40-46`, `db/database.ts:56-60`). Add a process-level semaphore for interactive
    audits and turns that answers 429 with `Retry-After` when full (durable admission already makes the
    background runner the fallback); limit in `config/execution.ts`.
  - SIGTERM: `server.ts:16-23` closes and exits while SSE streams hold it open; abort open turns so they
    settle as interrupted.
  - The whole-turn limit is read live (`routes/agent.ts:173`) while the per-call timeout is frozen
    (`agent/contracts.ts:44-49`); freeze it in the run's budget (invariant 13).
  - `agent/model-calls.ts:274-276` records a null receipt for failed calls; pass `ModelError.usage`
    (`models/http.ts:44-45`) as platform metering already does.
  - `.github/workflows/gcp-deploy.yml:136` checks `ORIGIN_UPSTREAM` for `app marketing` only; add `api-host`.
  - Tests: semaphore full → 429 then admitted after release; an interrupted turn settles on shutdown; the
    frozen limit survives a config change mid-run; failed-call usage reaches the receipt.

### DB. Schema hardening (migrations)

- **DB1.** `providers/capacity.ts:82` locks each bucket (including the single `funded_global` bucket) and
  `:150-156` sums `provider_capacity_leases` over every lease ever written under that lock; nothing deletes
  released leases. Forward migration: partial index `(bucket_id) WHERE released_at IS NULL`, an
  `audit_tasks (status, available_at)` index (claims rank the whole backlog, `queue/audit-queue.ts:25-31`)
  and a unique index on `response_analyses(task_id)` (only a primary key guards idempotent analysis,
  `migrations/0001_baseline.sql:3815`). Purge released or expired leases past a retention window in the
  existing audit maintenance phase. Tests: capacity acquire/release with the purge
  (`provider-capacity.test.ts`); duplicate analysis insert refused.
- **DB2.** 96 baseline tables carry `workspace_id` and `project_id` but only 16 have a composite foreign key
  to `projects(workspace_id, id)`; 44 tables (`prompts`, `prompt_sets`, `topics`, `competitors`, `brands`,
  `raw_response_artifacts`, `provider_attempts`, `audit_events`, …) have no `workspace_id`, so
  `WorkspaceScope` cannot cover them (`db/workspace-scope.ts:19-21`) and callers hand-write `project_id`
  joins (`audits/freeze.ts:98-103`, `mcp/write-tools.ts:155-166`, `projects/competitors.ts:63-69`).
  Forward migration: composite foreign keys for the 80 tables; `workspace_id` plus composite foreign key on
  the project-owned children (`prompts` through its set); writers populate it. Add one isolation test driven
  by the route registry (today a fixed list of 7 reads and 7 writes, `test/request-access.test.ts:243-263`).
  The tables are empty in production, so no backfill.
- **DB3** (found by P19 #641). `audit_tasks.error_code` is `varchar(32)`, but the audit code
  `credential_unavailable_for_retrieval` is 36 characters, so writing that failure errors out. Forward
  migration widening the column (or a check that every declared error code fits, whichever owns the code
  list). Test: a task failing with the longest declared code persists that code.

### Q. One queue-lane owner

`queue/` becomes the lane owner. Each lane registers a descriptor (table, claimable statuses, scope
columns, attempt-charge point as documented per lane in `docs/backend-architecture.md`, lease TTL, extra
readiness predicate). The owner holds the ranked `FOR UPDATE SKIP LOCKED` claim, the
`queue_workspace_turns` upsert, heartbeat, the fenced lock, `nextDue` and the shared reclaim. Domain
lifecycle (audit parent-first locks and parks, Site Health crawl locks, integration events) runs as hooks
inside the lane transaction.

Evidence: five turn-cursor upserts (`queue/task-queue.ts:207`, `queue/audit-queue.ts:168`,
`queue/discovery-queue.ts:75`, `agent/queue.ts:108`, `workers/integration-worker.ts:199`); discovery has no
per-workspace rank (`queue/discovery-queue.ts:44` vs `queue/task-queue.ts:90`); four heartbeat/fence copies
(`task-queue.ts:235`, `audit-queue.ts:221`, `discovery-queue.ts:92`, `agent/queue.ts:134`); the generic
enqueue lives in `referrals/enqueue.ts` (19 importers, 11 pass the attempt budget by hand); three
coalesced-successor copies with three lock styles (`crawl-logs/state.ts:82-121`,
`crawl-logs/insights-enqueue.ts:14-50`, `integrations/projections.ts:24-47`); four kind-keyed maps that must
match (`workers/analytics-worker.ts:59`, `config/analytics.json` tasks and `task_lease_ttl_seconds`,
`workers/terminal-compensation.ts:14`).

- **Q1** (wide): move enqueue from `referrals/enqueue.ts` and the executor contract (`Executor`,
  `TaskCancelledError`, `TerminalExecutorError`) from `workers/executor.ts` to `queue/`; enqueue takes the
  kind's default attempt budget. Add a real-PostgreSQL fairness test parameterized by lane and run it
  against today's five implementations (discovery and the Agent queue have none). Pure moves otherwise.
- **Q2:** one analytics kind registry `{run, compensate?, leaseTtlSeconds?}` exported per feature;
  `ts_owned_task_kinds`, the compensator map and lease TTLs derive from it; delete the JSON `tasks` map.
  Update invariant 1's sentence naming the analytics catalog owner. Test: registry kinds equal the
  schema-allowed analytics kinds.
- **Q3:** the lane descriptor with shared claim, cursor, heartbeat and fence; migrate analytics and Site
  Health (`TaskQueue`). Cap the ranked candidate set instead of ranking the whole backlog
  (`queue/task-queue.ts:83-94`); analytics retries back off exponentially with jitter instead of a fixed
  delay (`workers/analytics-worker.ts:112`).
- **Q4, Q5, Q6:** discovery, Agent and integration lanes on the descriptor; each deletes its own claim,
  heartbeat and lock copy. The fairness test covers each lane.
- **Q7:** the audit lane last (parent-first lock), deleting `AuditQueue.claim` and folding
  `workers/audit-scheduler.ts`'s claim statement.
- **Q8:** `enqueueCoalesced({kind, scope, coalesceOn?, merge?, delaySeconds})` with one lock through
  `db/advisory-lock.ts`, queued status from policy, a queued successor for leased work, delay at insert and
  earliest deadline wins (`docs/ai-traffic.md`). Migrate the three copies; AI Traffic producers request the
  insights refresh through it, so referrals, site-health, analysis and routes stop importing `crawl-logs/`
  (the GA4 gate stays only in the executor). Test: two transactions enqueue the same kind at once → one
  queued row with the earliest deadline.

Protecting tests: `task-queue.test.ts`, `audit-queue.test.ts`, `queue-isolation.test.ts`,
`lease-recovery.test.ts`, `heartbeat.test.ts`, `discovery.test.ts`, `agent-runtime.test.ts`,
`integration-worker.test.ts`, `analytics-worker.test.ts`, `runner.test.ts`, `worker-poll.test.ts`.

### SH. Site Health crawl machinery

- **SH1:** `site-health/task-outcome.ts` classifies a failed task once (`excluded | gone | not_page |
  blocked | error`) as a TS predicate and SQL fragments; each consumer keeps its own decision about the
  category. Removes the lists in `coverage.ts:144-148`, `frontier.ts:34-38`, `discover-task.ts:53`,
  `lifecycle.ts:34`, `snapshot-eligibility.ts:10-11`, `resolution-evidence.ts:48`,
  `reads/crawl.ts:350,395-397`, `reads/page-rows.ts:195` (#510 and #511 each edited several together).
  No behaviour change.
- **SH2:** the crawl-status vocabulary exported once from contracts with named sets (active, terminal,
  usable). Delete the never-written `draft`, `validating` and `paused` states
  (`frontend/packages/contracts/src/site-health/crawl.ts:7-11`, `site-task.ts:105,116`,
  `reads/dashboard.ts:42`, `frontend/lib/site-health/status.ts:79-85,333`) and unify the differing active
  sets (`site-task.ts:20` vs `lifecycle.ts:32`). Delete the legacy fallbacks for rows older crawls wrote
  (`page-rerun.ts:14-15,19-20`, `lifecycle-finalize.ts:168-177`, `analysis-rows.ts:170-186`,
  `internal-link-pages.ts:47`). A migration only if a constraint lists the dead states.
- **SH3:** one `site_crawl_tasks` enqueue writer (key format, `max_attempts`, both conflict modes) replacing
  the inserts at `admission-writes.ts:242`, `frontier.ts:254`, `lifecycle.ts:188`, `link-metrics.ts:67`,
  `planner.ts:84`; `admission-writes.ts` becomes the only writer of `site_urls` (today also
  `frontier.ts:186`, `discover-task.ts:184` with a different conflict rule), observations (five writers)
  and system memberships. Choose once the rule for a seed seen again by discover. Test: seed then discover
  the same URL.
- **SH4:** `site-task.ts` owns one runner for every task kind: one lock (today `.forNoKeyUpdate()` at
  `site-task.ts:240` vs `.forUpdate('crawl')` at `task-fence.ts:13`), one settle, one backoff (today
  2× base at `site-task.ts:46-48` vs 1× base with different jitter at `workers/site-health-worker.ts:384-385`)
  and a mandatory access re-check (today optional `checkAccess?.()` at `discover-task.ts:65`,
  `analyze-task.ts:169`, `site-setup-task.ts:67,90,127`). Built on Q3's fence. Deletes `task-fence.ts`, the
  worker's own backoff, `site-setup-task.ts underLease` and `analyze-task.ts lockForCommit`. Test: a thrown
  error and a returned failure get the same backoff.
- **SH5:** one counter chooser (live while active, persisted when terminal) replacing `rowCounters`'s
  fabricated zeros (`reads/crawl.ts:166-191,243`, invariant 7); Commerce reads Site Health's commerce facts
  through the producer's exported schema instead of a re-declared one with defaults
  (`commerce/projection-facts.ts:26-45`); reads use the crawl's pinned `formula_version` /
  `scoring_version` instead of the current config (`reads/pages.ts:227`, `reads/page-rows.ts:244`,
  `reads/crawl.ts:150`).

Protecting tests: `site-health-acquisition`, `-analyze`, `-admission`, `-terminal-publication`,
`-recovery`, `-controls`, `-reads`, `-finalize`, `site-link-metrics`, `site-architecture`,
`commerce-projection`, `frontend/lib/site-health/status.test.ts`.

### B. Consumable holds, one plan gate, one grant writer

- **B1:** `entitlements/ledger.ts` owns the hold lifecycle keyed by `Subject`: `hold`, `settle` (debit
  `min(spent, held)`, release the rest), `release`, `refundSubject`, one `remaining()` projection, the
  workspace→account lookup, the capacity lock, subject-derived idempotency keys and a typed refusal. Each
  feature keeps its policy on top (Agent hold sizing B60, refund on failure B58). Migrate
  `site-health/fetch-budget.ts` (re-implements available units at `:39-58` and held units at `:84-110`).
- **B2:** migrate `billing/metering.ts:157,235,243`, `audits/prompt-runs.ts:43,94-95`,
  `agent/funding.ts:201,235,246`; delete direct `consumable_ledger` queries and the balance-formula copies
  (`billing/reads.ts:327`). #465 fixed a drift between usage reads and admission.
- **B3 (OD2):** `WorkspaceEntitlements.requireFlag(key)` takes the capacity lock and builds the refusal
  from the registry's `codes` block; one occupancy counter table behind `admit(key, n)` and
  `billing/reads.ts occupancyCounts`. Replaces per-counter admits (`entitlements/occupancy.ts:57,86,113,254,275`)
  and hand-built refusals (`crawl-logs/sources.ts:136-150`, `projects/brand-facts.ts:62-65`,
  `public-api/auth.ts:63-66`, `agent/funding.ts:51-56`). Refusal codes and statuses carry over exactly.
  Correct `docs/billing-entitlements.md:57`.
- **B4:** `entitlements/grants.ts` is the only writer of `account_grants` and the lifecycle bump (today also
  `entitlements/bootstrap.ts:167,192`, `billing/settlement.ts:557`); Site Health owns `runtimeProjection`
  and the only writer of `workspace_site_health_runtime` (today `bootstrap.ts:37`, `grants.ts:64`,
  `site-health/planner.ts:48`). Drop the never-read `resolved_valid_until` (migration).
- **B5:** `billing/settlement.ts settleRefund` records the credit note through receipts and applies B52
  (today in `billing/receipts.ts:381-443`, called from `billing/recovery.ts:351`); a typed grant source
  replaces `source_ref` string parsing and LIKE matching (`grants.ts:108`, `receipts.ts:410-414`).

Protecting tests: `billing-ledger`, `metering`, `agent-funding`, `audit-admission`, `entitlements`,
`billing`, `billing-documents`, `site-health-acquisition`, `self-serve-trial`. Preserve B52 timing and
settlement's optimistic version predicate.

### C. Prompt write path and command surfaces

- **C1:** `prompts/` exports one `insertPrompts(trx, set, rows, {origin, onDuplicate})` that takes the
  documented locks (project → set → capacity, `prompts/locks.ts:5-7`), dedupes, admits occupancy, derives
  `branded`/`status`/`origin` and populates DB2's `workspace_id`. Replaces the inserts at
  `prompts/prompts.ts:274,498`, `prompts/candidates.ts:262`, `commerce/buyer-prompts.ts:224` (capacity lock
  only, hard-coded `branded: false` and literal status/origin). Commerce's `prompts.enabled` toggle
  (`commerce/decisions.ts:62`) goes through `updatePrompt`. Test: a concurrent candidate accept and
  Commerce insert into one set, and an over-allowance race.
- **C2:** commands take `{workspaceId, projectId}` as `commands/competitors.ts` and `schedules.ts` already
  do; owner writes filter by project. Delete the write-side `OWNERS` entries in `public-api/ownership.ts`,
  `requireInProject` (`mcp/write-tools.ts:278,296,349,366,760`) and the inline archive lookup
  (`mcp/write-tools.ts:580-590`). `public-api/ownership.ts:70-73` throws on any unmapped `*_id` path
  parameter instead of skipping it. Test: one foreign-project ID per command.
- **C3:** a command carries `{capability, scope}`; routes derive their declaration from it and
  `requireCapability` runs once in the command invoker (today twice: `routes/prompts.ts:48,111` vs
  `commands/prompts.ts:21-25`, `routes/audit-schedules.ts:16` vs `commands/schedules.ts:12`,
  `routes/audits.ts:134-140` vs `commands/audits.ts:87`, plus `mcp/write-tools.ts:534-535`). One
  `memberCan(db, workspaceId, userId, capability)` replaces the 13 direct `workspace_members` queries with
  differing predicates (e.g. `site-health/internal-link-judgments.ts:100-107` skips `is_active`); writes use
  `active-project` authorization instead of `project` (`routes/define.ts:182,233`). OpenAPI output is
  unchanged (`public-api:reference --check`).
- **C4:** `mcp/confirmed-changes.ts` becomes one table `{kind: {payload, execute}}`; the prepare tool
  rehearses `execute` and `confirm_change` runs the same one (today written twice:
  `write-tools.ts:600-611` vs `confirmed-changes.ts:50-62`, `:765-769` vs `:89-96`); `confirmedKinds`,
  `McpWriteKind` and the security-event kind enum derive from it.
- **C5:** one `citeladder://` record-kind table in contracts read by `mcp/links.ts`, `mcp/retrieval.ts` and
  `frontend/lib/agent/evidence.ts` (today `visibility_result` links to `/runs/{id}` on the server and
  `/visibility` in the browser, and the browser has a dead `citation` kind). Routes declare a self-bounded
  body (`body: 'stream'`) so `app.ts:85-88` stops importing `routes/crawl-logs.ts`.

Protecting tests: `prompts`, `prompt-builder`, `prompt-generation`, `commerce-buyer-prompts`, `public-api`,
`mcp-writes`, `mcp-retrieval`, `mcp-evidence`, `ownership`, `audits-http`, `crawl-logs`.

### E. Engine surfaces

`config/providers.json` already tags each route with `surface_kind` (`llm`, `llm_scraper` for
`chatgpt_search`/`gemini_consumer`, `search_ai` for `google_ai_overview`), but the backend branches on
engine ids instead (`audits/creation.ts:242-243`, `audits/estimate.ts:103,147`,
`audits/submission-intent.ts:63`, `audits/maintenance.ts:27`, `workers/audit-worker.ts` ten sites,
`search-surfaces/dataforseo.ts:68`, `audits/execution-context.ts:171`, `audits/freeze.ts:261`).

- **E1:** one DataForSEO envelope client (`call(path, payload) → Envelope`) with one status mapping and
  cost normalisation, used by surfaces and Keyword Research; `providers/` owns `connectionSecret` and the
  pool identity (today copied at `audits/execution-context.ts:148-158,170-173` and
  `search-intelligence/credentials.ts:116-136`). Fixes Keyword Research treating envelope `40100` /
  account-unavailable as `parse_error` and keeping a refused credential in use
  (`search-intelligence/live.ts:116-122`, `acquisition-state.ts:59` vs `search-surfaces/dataforseo.ts:107-118`).
  Tests: fake `send` for 40100 and 402xx on both products.
- **E2:** a typed (zod) frozen configuration written by `freeze.ts`/`creation.ts` and read everywhere
  instead of `record(audit.configuration)` with local fallbacks (`audits/execution-context.ts:160-161,202-204`,
  `workers/audit-worker.ts:340,357`); delete the `measurement_policy_key` indirection
  (`config/audits.json:315`, read at `analysis/comparison.ts:42`, `analysis/provenance.ts:29`, written as a
  literal at `audits/freeze.ts:489`). Missing fields stay unavailable.
- **E3:** engine sets derive from routes: delete `visibility.json logical_engines` /
  `search_surface_engines`, `search-surfaces/locations.ts SEARCH_SURFACES` and the
  `answer-engines/contracts.ts:5` enum copy; the provider-catalog contract carries engine label and order,
  and the browser's `ENGINE_ORDER`, `ENGINE_LABELS`, `SEARCH_SURFACE_ENGINES` and `isConsumerEngine`
  (`frontend/lib/providers/catalog.ts:27-64`) go.
- **E4:** `audits/surfaces/` holds one adapter per `surface_kind` owning its frozen request, dispatch phase,
  recovery deadline, capacity pool and persistence; extract `llm` first. `AuditWorker` shrinks to lease,
  heartbeat, capacity and dispatch and moves to `audits/`, ending the `audits ↔ workers` cycle
  (`audits/interactive.ts:4`, `audits/seed.ts:7`). The six-flag `FailureOptions`
  (`audits/result-persistence.ts:199-208`) and the flag-driven `persistOverview`
  (`audits/surface-persistence.ts:79-106`) become per-adapter calls.
- **E5:** `search_ai` and `llm_scraper` adapters; delete the remaining engine branches.

This is the paid-submission path: commit-before-I/O, never-resubmit and the lease fence must hold, and each
phase's transaction boundary stays where it is. Tests: `audit-worker`, `audit-maintenance`,
`audit-surface-persistence`, `audit-result-persistence`, `audit-execution-context`, `audit-freeze`,
`audit-estimate-export`, `surface-parsing`, `dataforseo`, `provider-capacity`,
`search-intelligence-acquisition`, `frontend/lib/providers/catalog.test.ts`.

### O. Opportunities and Visibility reads

- **O1:** `visibility/selection.ts` exports one "latest dashboard brand run" (brand scope, market,
  ordering) used by `visibility/dashboard.ts:135-152`, `visibility/prompts.ts:100-112`,
  `opportunities/sources.ts:51-58` and `projects/command-center.ts:46-58`; `selectedRuns` applies the brand
  scope so readers stop adding it one by one. Commerce hits read the latest Commerce run explicitly. This
  fixes the Opportunity refresh reading the latest run of any scope and market, so brand and Commerce
  Actions no longer replace each other. Mention and citation rates get one owner (today
  `visibility/prompts.ts:269-284` and `analysis/aggregate.ts:252-270`); `avg_queries_per_execution`
  divides by executions with `search_query_text_available` (`analysis/aggregate.ts:290`). Test: a refresh
  with a brand run followed by a Commerce run.
- **O2:** `opportunities/checks/<kind>.ts` (site_rule, contextual_link, visibility_metric, traffic_metric,
  keyword_presence) behind one interface typed by the contract's `expectedCheckSchema`; the rule catalog
  gains `check_kind` (null = unmeasurable); `measure_with`, `memberMeasurementLeg`,
  `CHECK_KIND_MEASUREMENT_LEG`, `SOURCE_CHECK_KINDS` and the `declaration-view` switch derive from it.
  Delete `EARNED_RULE_IDS` and the `'site_contextual_links'` literal branches. Test: for every enabled rule,
  the leg shown before declaration equals the leg frozen at declaration.
- **O3:** producers emit a `TargetRef` union; `group_key`/`target_key` derive in one place and `targetFor`
  becomes a total switch (today a prefix parser at `analysis/opportunities/actions.ts:50-73` over prefixes
  defined in five files). Each family registers `{identity, hits}` and `refresh.ts` iterates the list;
  per-rule evidence schemas move to contracts; Opportunities exports "earned Action per page hash" for
  `visibility/sources.ts:404` and `visibility/page-standing.ts:96-112`. The keyword-gap family touched 31
  files (`126686f02`).
- **O4:** `announceEvidence(trx, scope, {kind, id})` enqueues refresh and, inside a declaration window,
  verification; replaces `opportunities/verification.ts:24-67` and the paired enqueues in
  `source-pages/inspector.ts`, `search-intelligence/acquisition-state.ts`, `traffic/snapshot.ts`,
  `site-health/terminal-handoff.ts:30-53`. Keep the idempotency key format.

Protecting tests: `opportunity-refresh`, `opportunity-verification`, `opportunity-decisions`, `actions`,
`search-gap-actions`, `page-standing`, `visibility-reads`, `audit-commerce`.

### F. Browser server state

- **F1, F2:** `@citeladder/contracts` exports every request body schema and its `z.input`/`z.infer` types;
  server input modules `.extend` them with config bounds; browser API modules type arguments as
  `z.input<…>`. F2 deletes `frontend/lib/api/types.ts` (98 aliases, 44 commits since August) and the
  hand-written `*Input` types. Evidence: `audits/inputs.ts:12-27` vs `frontend/lib/api/runs.ts:42-55`
  (`benchmark_mode?: string` weakens the enum), `routes/action-contracts.ts:15-22` vs
  `frontend/lib/api/actions.ts:31-36`, `frontend/lib/api/projects.ts:49-68` vs `projects/inputs.ts`
  (co-changed in `587d3d920`).
- **F3:** the Search Intelligence dataset-kind enum and trait table live in contracts (today
  `routes/search-intelligence-contracts.ts:32-71`, `acquisition-state.ts:110`,
  `frontend/lib/config/search-intelligence.ts:130-142`, `dataset_kind: z.string()` in contracts).
- **F4, F5, F6:** each `frontend/lib/api/<domain>` module exports query factories on one shared scoped-key
  builder and mutation descriptors carrying their invalidation set and `setQueryData`; screens,
  prefetchers and `useCursorTableQuery` consume them; cross-domain fan-outs move there. Today 61
  `invalidateQueries` calls live in components and none in `lib/api`; `topics.seedQueries` is invalidated
  by hand in three places and #489 was the missed fourth; `route-prefetch.ts:54-57,98-101,115-118`
  duplicates screen reads; positional key reads at `frontend/lib/api/opportunities.ts:61-66` and
  `frontend/lib/project/bootstrap-loader.ts:168-172`.
- **F7:** each job family exports one exhaustive `Record<Status, {label, badge, active}>` and the shared
  poll-while-active helper reads intervals from `frontend/lib/config/operational.ts` (today restated in
  `components/settings/integration-connection-row.tsx:36-44`, `search-intelligence-runs.tsx:19-27`,
  `use-range-projection.ts:76-83`, `readiness-ladder.tsx:101-104`, `runs-screen.tsx:27`,
  `inventory-section.tsx:106` with hard-coded 1,500–15,000 ms intervals). One score-band function for
  `aeo-readiness-panel.tsx:66-67` and `ui/score-ring.tsx:14-15`.
- **F8:** `MutationNotice` (and `ReadError` for reads) is the only failure renderer; 32 sites render a bare
  Callout through four error translators (e.g. `ai-traffic-screen.tsx:173`, `settings/api-keys.tsx:251,376`,
  `agent/output-canvas.tsx:261`) and `demand/demand-projection.tsx:94-103` re-implements the notice.
- **F9:** type the blobs where the browser hard-codes server vocabulary (Site Health issue evidence by
  `rule_id`, demand `summary.detectors`, opportunity `source_pattern`, the MCP App's tool results) and
  delete the "older rows" defensive parsing.
- **F10:** server-enforced request bounds travel in a `limits` block on the read that opens the form
  (prompts/builder, audit launch, Agent composer); delete the mirrored constants
  (`frontend/lib/config/prompts.ts:3-12`, `operational.ts:118-120`, `agent.ts:29`).

Protecting tests: `route-prefetch.test.ts`, `bootstrap-loader.test.ts`, `prompt-library.test.tsx`,
`lib/runs/status.test.ts`, `lib/site-health/status.test.ts`, `mutation-notice.test.tsx`, plus component
tests asserting refreshed content after a write.

### R. App routes and kit

- **R1:** delete `BarList`, `DonutChart`, `ChartCard`, `Popover`, `FormRow` and the exported `scoreFill`
  (about 520 lines only tests import); update `docs/frontend-architecture.md` capability rows and the
  `docs/decisions.md` chart-kit mention (the no-chart-library decision stays).
- **R2:** `frontend/lib/navigation/app-routes.ts` (no React, no static domain imports) declares per
  destination `path`, `title`, `scope`, `mode`, nav placement, lazy `screen`, `collection` and
  `credentialInUrl`; nav groups, command groups, titles, workspace-only detection, project-owned roots, mode
  homes, user-menu links and the router derive from it. Replaces seven lists
  (`apps/app/src/router.tsx:52-171`, `components/layout/nav-items.ts:32-98`, `page-titles.ts:14-34`,
  `lib/project/bootstrap.ts:36-43`, `lib/navigation/project-destination.ts:125-131`,
  `lib/navigation/route-prefetch.ts:25-120`, `components/layout/mode-switch.tsx:20-23`); `43cce367a`
  edited four for one screen. Screen imports stay `() => import()` (bundle budget).
- **R3:** the router imports screens directly; delete `apps/app/src/product-routes-*.tsx` and the
  `*-route-content.tsx` pass-throughs (keep `prompts-route-content.tsx`) and the duplicate Suspense in
  `settings-route-content.tsx:13-26`; move `pricing-route.tsx` to `components/billing/`.
- **R4:** the gate provides a non-null `ProjectScope` on project routes; delete `project-required-state.tsx`,
  `ui/no-project-state.tsx`, the 15 unreachable `ProjectRequiredState` branches and the `?? ''` keys /
  `enabled: Boolean(projectId)` guards (about 58 sites). Shared components keep the nullable hook.
- **R5:** move `command-palette.tsx` to `layout/`, `ProjectLink` to `ui/`, `agent-nav.tsx` to `agent/`, and
  pass the header's Agent trigger through the shell context, so `components/ui` imports nothing from
  `components/*`.
- **R6:** `apps/app/worker.ts` derives reserved and proxied paths from `route-ownership.ts` (today restated
  at `worker.ts:36-43,102-107,163`).
- **R7:** `TrendChart.height` becomes the `ChartFrame` height role (pages pass 160, 240, 292).

Protecting tests: `router.test.tsx`, `sidebar-nav.test.tsx`, `onboarding-gate.test.tsx`,
`command-palette.test.tsx`, `apps/app/worker.test.ts`.

### MK. Marketing site

- **MK1:** each page/policy/guide record carries `path`, `metaTitle`, `description` and `updated`;
  `PUBLIC_ROUTES` maps over records and the sitemap `lastmod` and IndexNow read `updated`. Today the hand
  dates are stale (`apps/marketing/src/public-routes.ts:47-57`: home 2026-10-16 and Enterprise 2026-10-21
  although both were rewritten in #605, #612, #616, #619); set them to the real last change. Delete the
  never-used `CompareTable` (#579) and its `.cl-verdict*` CSS.
- **MK2:** legal and top-level research pages become one `getStaticPaths` route each; delete the eight
  identical legal route files, `PAGE_UPDATED`, `LEGAL_UPDATED`, the `LegalSlug` union and
  `lib/marketing-content/legal.ts:54-86`'s restated slugs. Compare the built URL list before and after;
  moved URLs get 301s.
- **MK3:** the screen catalogue is the only module-to-image map (today also `landing-page.tsx:81-116`,
  `ResearchLayout.astro:35-38`, `commercial-page.tsx:6-8`).
- **MK4:** numeric trial and free-tool limits are interpolated from their config owners with the rendered
  words unchanged (`pricing-catalog.tsx:232-244`, `pricing.tsx:53`, `landing-page.tsx:57`, the
  200,000-character limit at `tools/[slug].astro:44`, `tools/robots-tools.tsx:40`,
  `lib/marketing-content/tools.ts:149`).

Protecting tests: `public-routes.test.ts`, `content.test.ts`, `screens.test.tsx`, `landing-page.test.tsx`.

### G. Configuration

- **G1** (wide): move the SettingSpec engine to a leaf `config/settings.ts`; move `loadWorkerSettings` to the
  analytics lane config and `activeJobRetrySeconds` to `abuse/`; delete the cross-owner alias re-exports
  (`config.ts:137-144` renames seven Site Health constants under Opportunity names; `projects`,
  `brand_identity`, `mcp`, `traffic` and `search_intelligence` do the same) in favour of importing the
  producing config module; delete the unread `policy.crawl_logs` (`config.ts:77`); break the
  `config.ts:52-57 ↔ billing/config.ts:1` cycle. Do not rewrite the 412 importers of `config.ts`; new code
  imports `config/<owner>.ts`.
- **G2** (wide): `loadConfig(env)` resolves every owner's settings once and owners receive their settings
  object; delete `resolveSettingSpec`'s `process.env` default (`config.ts:618-621`, 36 call sites), the
  `configEnvironment` WeakMap (`config.ts:517-522`, 18 callers) and `config/execution.ts:24-41`'s second
  env parser. Startup then validates every owner's settings. Tests: `config`, `production-security`,
  `runtime-policy`, `site-health-config`, `crawl-log-config`, `mcp-config`.
- **G3:** `abuse/usage.ts budget(name)` over a catalog in `config/abuse.ts`; callers pass a name and a
  subject. Replaces about 40 hand-built limit triples, the same budget twice at
  `routes/site-health-crawls.ts:117-120,135-138` and the composite subject passed as a workspace id at
  `routes/integrations.ts:387`. Keep operation strings so usage windows do not reset. Test: `abuse-usage`.

### X. Shared identities and misplaced logic

- **X1:** one citation identity: `source-pages/identity.ts` writes `citations.url_hash` and
  `source-pages/sync.ts`/`inspector.ts` call it instead of `site-health/url-identity.ts citationIdentity`
  (the two disagree on dot segments, so one page can get two `source_pages` rows); one redirect-host list
  (`config/source-pages.ts`, duplicated at `analysis/domains.ts:4-5`). Commerce compares with Site
  Health's `canonicalUrl` instead of `catalogUrl` (`commerce/projection-facts.ts:59-74`, compared with
  `site_urls.normalized_url` at `commerce/projection.ts:234`; differs on percent-escapes and repeated query
  keys, so such product links fail to link). Differentiation reports become insert-only per
  `formula_version` instead of overwritten in place (`source-pages/differentiation.ts:324-334`).
  Tests: a URL cited directly and through a redirect gets one hash (dot segments, tracking params, Unicode
  host); Commerce cases with `%7e` and repeated keys (`commerce-projection.test.ts`).
- **X2** (wide): one `round`, one `canonicalJson`/identity hash (keep `comparisonJson`'s byte format), one
  `casefold`, one calendar-day module (`addDays`, inclusive day count; today imported from
  `referrals/projection.ts` by five modules and copied in `integrations/sync.ts:14-30`);
  `projects/safe-fetch.ts` to a top-level fetch module (16 importers); `billing/pdf.ts` to `documents/`;
  `digest`/`conflict` out of `billing/contracts.ts` (removes both billing↔entitlements back edges);
  `ProviderError` to `providers/`; delete the `rowsToCsv` pass-through. Pure moves.
- **X3:** `pathIdentity`/`landingPage` move beside `canonicalPage` (output byte-for-byte unchanged; it is a
  persisted join key), removing the integrations↔traffic, crawl-logs↔integrations and referrals↔traffic
  edges.
- **X4:** AI Traffic composition (`crawl-logs/{pages,pages-data,insights,overview,citation-runs}.ts`, about
  1,060 lines) moves to its own module.
- **X5:** integration grant revocation and the eight `integration_events` inserts move behind
  `integrations/` (today `routes/integrations.ts:457-528` holds 20 SQL statements and the grant state
  machine); `crawl-logs/state.ts adoptReportingTimezone` owns the timezone switch the integration worker
  writes inline (`workers/integration-worker.ts:556-570`).
- **X6:** the `auth/bootstrap.ts:6 ↔ workspaces/account-manager.ts:16` cycle goes and the four copies of
  "the owned workspace of a user" (`workspaces/service.ts:53-62`, `auth/bootstrap.ts:29-37`,
  `auth/development-access.ts:9-18`, `entitlements/bootstrap.ts:297-306`) get one owner.
- **X7 (OD3):** the landing/source breakdown (`referrals/landing.ts:68`) and Performance
  (`traffic/projection.ts:195`) read the persisted `referral_classifications` the headline reads, instead of
  classifying live. Test: after a rule change and before reclassification, headline, landing and
  Performance agree.
- **X8 (OD1):** the audit-state transitions and downstream enqueues in `analysis/finalization.ts:8,17-19`
  and the `DeriveExecution` step with its perception enqueue in `analysis/execution.ts` move into
  `audits/` beside the worker E4 moved there; `analysis/` keeps only derivation and
  `docs/backend-architecture.md` is unchanged.
- **X9 (OD7):** `referrals.retention_days` (`config/referrals.json`, today 90) stops being an independent
  number: it equals the Performance window (`traffic.json` `PERFORMANCE_CUSTOM_RANGE_MAX_DAYS` /
  `TRAFFIC_MAX_WINDOW_DAYS`, 480), derived from that one value or enforced equal by config validation.
  Update any document that states the referral retention period. Test: a referral event 200 days old
  survives `referral_retention_sweep` and still counts as AI in Performance, and one older than the
  window is deleted.

Protecting tests: `normalization-decisions`, `audit-scoring`, `ai-traffic`, `integrations-routes`,
`integration-dispatcher`, `integration-sync`, `bootstrap-sequence`, `workspaces`.

### K. Internal cost (before public sign-up)

- **K1:** internal cost lives in three shapes (`platform_calls.cost_microusd` at `billing/metering.ts:118`,
  `execution_cost_projections` at `audits/costs.ts:142-189`, and `agent_model_attempts` with tokens but no
  cost) and two rate cards (`config/costs.json`, `config/ai-credits.json`; the Anthropic search fee appears
  in both). Build one internal-cost view across them; price Tavily and Keenable per request (today null at
  `commerce/discovery-provider.ts:60-62`, `projects/research-evidence.ts:163-168`); write cost rows in the
  call's transaction where possible instead of best-effort (`metering.ts:101-129`). OD6 stands: unpriced
  gateway models keep the Haiku rate.
- **K2:** a platform-wide daily spend breaker in the metering owner refuses `included` and `not_charged`
  calls above a configured ceiling (today bounded only by per-workspace rate limits; the funded budget
  counts audits only, `audits/admission.ts:145-157`).
- **K3:** every charged call reserves a 64,000-token output hold (`config/model-gateway.json:24-27`,
  `billing/metering.ts:190-199`, about 42 credits even for small calls, enough to refuse a low-balance
  workspace); each feature declares its own output cap.

### Z. Error handling and logging (last)

- **Z1:** each lane's terminal failure log carries error class, code, phase, attempt and elapsed time, and
  lease loss is logged, once in the queue owner (`workers/start-runner.ts:54-56` logs
  `runner_start_failed` without a reason).
- **Z2, Z3:** there are 184 empty `catch {}` / `.catch(() => …)` sites in `src/` (site-health 25,
  crawl-logs 8, commerce 8, search-intelligence 7, projects 6, workers 5, providers 5, integrations 5,
  auth 5, audits 5, …). Parse fallbacks stay. Each catch around network, provider, model or database I/O
  either logs a structured event (code, phase, elapsed, error class; never a credential or provider body)
  or rethrows. Z2 covers Site Health; Z3 the rest, one area per commit.
- **Z4:** every job-backed screen with a `failed` or degraded terminal state shows the action that
  recovers it (rerun, reconnect, edit input) through the shared failure renderer from F8.
- Tests: a failing transport produces the structured event and the documented state (assert on the event
  and the row, not on logger internals); each recoverable failure renders its action.
