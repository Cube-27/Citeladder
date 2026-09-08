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
| Plan checkpoint | **Complete** | `e16604b14c507f4551e557a9c7a387f4ba54aae1` pushed and verified on PR #35 |
| 0: proven CI repairs | **Complete locally; CI pending on `abf4f521`** | Commit `abf4f521` pushed. Focused evidence: 16 backend repairs, 308 Site Health checks, 1 opportunities component check, 4 E2E failures now pass. Full selector initially 1764 passed / 5 failed; repaired all 5, then retry delta selected 171 backend checks and passed. `scripts/check.ps1 -CheckOnly` passed. Do not treat old full-selector run as final green; CI still must verify the pushed SHA |
| 1: catalog/schema/operator | **Implemented locally** | Immutable persisted catalog, approved disabled seed, trusted `scripts.billing_admin`, redacted dry-run/apply contract, publication race/validation tests. No live activation |
| 2A: access/ledger | **Implemented locally** | Exclusive primary plus supplements, authoritative current resolution, typed immutable multi-grant ledger/refunds, safe workspace-entitlement read, PostgreSQL ledger tests |
| 2B: custom BYOK | **Implemented locally** | Shared Content/Growth routes, write-only encrypted key custody, pinned public-only HTTPS transport, revision-bound probes, no silent fallback; 19 provider component tests passed |
| 2C: Content metering | **Implemented locally** | Durable pre-I/O attempt/dispatch evidence, BYOK zero debit, optional persisted finite AI-credit policy, bounded settlement and retained provenance; mapped Content component suite 11 passed |
| 2D: Growth metering | **Implemented locally** | Native model-attempt evidence and worker rechecks use the shared metered boundary; BYOK is zero debit and funded execution requires explicit published policy/allowance |
| 3: settlement/recovery | **Implemented locally** | Normalized payment/refund receipts, frozen recurring terms, webhook replay/conflict handling, dual-secret verification and bounded reconciliation; billing unit 39 and mapped PostgreSQL commercial/API tests passed |
| 4: commercial journeys | **Implemented locally; campaign remains disabled** | Atomic once-per-account no-card claim, consent/idempotency/cohort/operator exception, expiry/end-early-access, unavailable card-trial contract; Phase 4 PostgreSQL/catalog/auth/OAuth 41 passed |
| 5: customer UI | **Implemented locally** | Catalog-driven pricing, honest disabled checkout, early-access confirmation, owner-private billing plus workspace-effective access, custom BYOK routes, unavailable card trial; typecheck and focused frontend tests passed |
| 6: quality/runbook | **Documentation complete locally; final CI pending** | Active architecture/invariants/owner requirements updated and [`billing-operator-guide.md`](../operations/billing-operator-guide.md) added with tested commands, inspection, reconciliation, rotation and incident controls. No production-provider evidence |

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

## Current verification evidence

The implementation is committed and under review in PR #39. Focused evidence
reported by the phase owners includes:

- clean empty-database migration upgrade/check (`test_brand_logo_migration`: 1 passed);
- funded ledger PostgreSQL tests: 9 passed; catalog/ledger PostgreSQL tests: 17 passed;
- provider component tests: 19 passed; Content mapped component tests: 11 passed;
- billing unit tests: 39 passed; billing commercial/API PostgreSQL tests: 24 and
  12 passed after persisted-catalog expectations were aligned;
- Phase 4 PostgreSQL/catalog/auth/OAuth checks: 41 passed; frontend contract,
  pricing, and Settings checks: 29 passed;
- frontend Phase 5 typecheck and focused tests passed; complexity/static checks
  were brought back to policy for the implemented owners.

These are deterministic fixture and local PostgreSQL results, not production
provider proof. Checkout remains disabled by default, the no-card campaign is
still draft/disabled, card trial remains unavailable, and no live Razorpay plan,
payment, invoice, settlement, refund, webhook rotation, or campaign activation
has been exercised.

## Immediate next bounded work

1. Run the repository documentation/diff checks, then the mapped final static and
   test selectors on the unchanged implementation tree.
2. Have GitHub CI verify the final SHA; record every selected owner and retry
   delta rather than treating focused local evidence as a full green run.
3. Keep checkout and the no-card campaign disabled until the separate owner
   checklist, sandbox evidence, and explicit go/no-go approvals are complete.
4. Use the [billing operator guide](../operations/billing-operator-guide.md) for
   reviewed catalog forward-publication, corrections, reconciliation, secret
   rotation, and incidents. Never mark mocked provider behavior as production
   evidence.
