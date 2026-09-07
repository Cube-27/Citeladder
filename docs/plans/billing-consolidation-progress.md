# Billing consolidation — execution handoff

## Authority and checkpoint

- User approved plan #1160, version 2, on 2026-09-07.
- [Approved plan](billing-consolidation.md), [summary](billing-consolidation-summary.md),
  [audit evidence](../audits/billing-consolidation-2026-09-07.md),
  [design manifest](billing-consolidation-designs/design-plan.json).
- Continue existing [PR #35](https://github.com/Cube-27/Citeladder/pull/35),
  remote head `fix/live-project-controls-and-frontend-review`, base `main`.
  Local working branch is `vorflux/billing-consolidation`. Do not open a new PR
  or force-overwrite another agent's work.
- Audited implementation baseline: `3bc20cf761bb489da77ddd35b1d6c1bcc5737782`.
  This documentation-only commit is the plan-first checkpoint; resolve its SHA
  with `git log --diff-filter=A --format=%H -- docs/plans/billing-consolidation.md`.
  Verify it is on the PR head's ancestry before any implementation.
- No live reset, deployment, real provider call, payment activation or live
  campaign activation is authorized. Keep only `0001_initial.py`; reset/rebuild
  disposable local/test databases. Never preserve obsolete compatibility code.

## Approved decisions to preserve

- USD/month: BYOK $49/$99/$149; funded $99/$149/$299; Enterprise contact-only.
- Content and Growth Agent: Tier 2/3; shared token-weighted AI credits. Rates and
  quantities remain unset until an operator supplies them, so affected platform
  calls remain unavailable. Audit attempt credits are a separate unit.
- Genuine customer model/key/base-URL routing for Content and Growth Agent;
  customer-funded calls spend no platform credits. No silent funding fallback.
  Reuse encrypted, write-only customer-key custody; master/platform/merchant
  secrets remain external. Custom URLs require pinned public-only HTTPS execution.
- No-card Tier 1 promotion: seven days, any new account, explicit claim, no
  email gate. Seed disabled in Phase 1; audited enablement only after Phase 4
  acceptance, independent of Razorpay. Optional OAuth/operator exceptions later.
- Future card trial: Tier 1 only, seven full days after verified hosted card
  authorization. Disabled pending provider/account/legal readiness.
- One lifetime introductory benefit across the two variants; separate audited
  complimentary grants remain possible. Exclusive base, explicit supplements.
- Recurring grant identity: internal subscription + authoritative cycle start/end
  + stable purpose, never a receipt/quote/catalog revision. Receipts prove funding;
  top-ups instead have canonical payment-specific effects. Conflicts quarantine.
- No recurring rollover; top-ups retain disclosed 30-day/base-end cap;
  next-cycle changes, no speculative proration. Unknown token holds expire after
  24 hours to platform absorption/review, not invented customer charges.
- Lean audited operator CLI, no admin dashboard or second backend.

## Phase status

| Phase | Status | Evidence / next action |
|---|---|---|
| Plan checkpoint | Prepared in this documentation commit | Push and verify on PR #35 before code |
| 0: proven CI repairs | Not started | Use exact failures in audit; preserve authorization/concurrency tests |
| 1: catalog/schema/operator | Not started | Depends on baseline; draft/disabled campaign only |
| 2A: access/ledger | Not started | Exclusive base, real PostgreSQL races, canonical refund/expiry |
| 2B: custom BYOK | Not started | Existing provider owner, secure authenticated POST boundary |
| 2C: Content metering | Not started | Native dispatch evidence, bounded reservations and settlement |
| 2D: Growth metering | Not started | Native narration evidence; no absent orchestration framework |
| 3: settlement/recovery | Not started | Canonical recurring period, replayable events and reconciliation |
| 4: commercial journeys | Not started | No-card claim gates before campaign enablement |
| 5: customer UI | Not started | Five approved final-state mockups; not Phase 1 availability |
| 6: quality/runbook | Not started | Review/simplify, actual operator commands, full CI owners |

## Validation evidence and setup

- Baseline [CI 34132365978](https://github.com/Cube-27/Citeladder/actions/runs/34132365978):
  37 backend failures / 3231 passed / 1 skipped; 4 E2E failures / 32 passed.
  Previous PR/main runs green. Contract/security and actual Compose smoke skipped.
- Read-only local classifier checks: 6/6; bounded source probes reproduced audit
  findings. These are not application-suite, migration or browser passes.
- Application validation has not run. Initial checkout lacks backend venv,
  frontend dependencies, PowerShell and disposable test services; infrastructure
  reports #719/#720 document setup gaps. Install pinned dependencies, never use
  real provider keys in tests and never let tests read `.env`.
- Documentation checkpoint: inspect relative links/design manifest, exact PR
  target and `git diff --check`; no application-complete claim or heavy gate needed.
- Each implementation phase uses mapped checks. Before implementation push or
  completion run `scripts/check.ps1`, then `scripts/test.ps1`; record failures and
  every retry delta. No full backend suite locally. Full final suites belong in
  GitHub CI on the final SHA; skipped owners remain unverified.

## Immediate next bounded work

1. Verify the documentation checkpoint push to the existing PR.
2. Provision pinned tools and disposable PostgreSQL while independent Phase 0
   backend and E2E/fixture owners address only evidence-backed failures.
3. Finish Phase 0 before advancing dependent schema/catalog work. Record any
   repair that requires Phase 2 rather than declaring a false green baseline.
4. Append actual commands/results and checkpoint SHAs here at each boundary.
   Never mark an unrun test or a mock-tested provider capability as verified.
