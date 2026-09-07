# CiteLadder billing, credits and BYOK consolidation

> Approved by the user on 2026-09-07 in Vorflux plan #1160 (version 2).
> This is approved future work, not a claim of implementation. Follow the progress record.
> Historical “proposed/approval” wording below records the reviewed plan; its stated defaults are approved, while explicitly unset commercial values and live actions remain unapproved.


> **TL;DR:** Reuse existing billing/credential foundations, make DB policy authoritative, fix accounting and access, and add real Content/Growth Agent BYOK and metering—after the approved plan reaches the same PR #35.

## Plan first; no live actions
First push **documentation only**—approved plan, audits, designs and progress—to [PR #35](https://github.com/Cube-27/Citeladder/pull/35), head `fix/live-project-controls-and-frontend-review`; verify it before application changes. No new PR or overwrite of unrelated work. Audited local head: `vorflux/billing-consolidation` / `3bc20cf7`.

Durable authority: `docs/plans/billing-consolidation.md`; handoff: `docs/plans/billing-consolidation-progress.md`. The documentation checkpoint needs diff/link/PR checks, not application setup. Only `migrations/versions/0001_initial.py`; disposable reset/rebuild, no preservation/backfill. No live reset, provider calls, deployment or payment activation is authorized.

## Audit in brief
Existing accounts, links, subscriptions, grants/revocations and ledger are reusable. Fix stacked base allowances, authorization/cache/quota gaps, conflicting balances, replay/refund/allocation gaps, lost webhook recovery and payment/quote mismatches. Content loses some usage; Agent lacks model-attempt evidence. Their current platform-key execution is not BYOK, and the apparent custom-model selector only uses localStorage.

[CI 34132365978](https://github.com/Cube-27/Citeladder/actions/runs/34132365978): **37 backend and 4 E2E failures**, mostly fixture/contract drift plus a real authorship regression. Previous PR/main were green. Skipped contract/security/Compose smoke are not passes; local application validation remains pending dependencies.

## Decisions and approval proposals
| Item | Boundary |
|---|---|
| Approved prices | Existing tiers; USD/month BYOK **$49/$99/$149**, funded **$99/$149/$299**; Enterprise contact-only |
| Approved AI benefits | Content + Growth Agent on Tier 2/3. Platform calls share token-weighted, versioned-rate **AI credits**. Rates/finite quantities remain unset; affected platform routes unavailable |
| Approved true BYOK | Customer model/key/base URL for Content/Growth too; no platform-credit spending/extra pack, no silent platform fallback. Product limits remain; reuse existing provider UI/API with SSRF-safe execution |
| Delegated custody | Main selected existing encrypted write-only customer-key DB storage with external master key after user delegated judgment. Merchant/platform secrets stay outside DB; no new secret service |
| Approved no-card offer | **Phase 1 draft/disabled seed; audited operator enablement only after Phase 4 claim/eligibility/lifetime-intro/idempotency gates.** Then seven-day Tier 1 for any eligible new-registration account, **explicit claim only**, no invented end date. No company/email gate or Razorpay dependency; paid checkout stays off. No live activation/deployment authorized |
| Future card trial | Separate Tier 1-only seven days after verified hosted credit/debit authorization and explicit privacy/data-sharing/renewal consent |
| Proposed intro/defaults | One lifetime intro across both variants; no stacked bases. Later optional OAuth-work-email policy/bounded operator codes, no mail service. Manual complimentary grants remain separate. Free 1 project/10 prompts/20 URLs; next-cycle changes; no recurring rollover; disclosed 30-day/base-end top-up cap |
| Proposed uncertain usage | Confirmed failed-output tokens are charged; unknown usage holds at most 24 hours, then platform absorption/review—not fabricated debits. No guessed tax, FX, grace or credit quantities |

## Bounded phases
Operator composition example, **not a seed**: 30-day Tier 2 complimentary access + 2,000 AI credits + an optional 20%-off first-three-cycles offer; require audited explicit actions and verified provider binding before any purchase. Tier 1-only intro rules do not prohibit operator-granted complimentary tiers. Audit attempt credits remain separate from token-weighted AI credits.

Three justified new tables: **catalog revision, payment receipt, Agent model-attempt evidence**. Extend native Content evidence and the existing ledger with typed real-FK branches/multi-grant settlements; reuse intents and retained mutation records for claims/operator audit.

Recurring grants use **`(internal subscription UUID, authoritative cycle start/end, stable purpose)`**, enforce account ownership and freeze one period bundle; receipts are funding evidence, not identity. Reuse source keys/DB uniqueness—no new table. Changed receipt/quote/catalog IDs never regrant; conflicting boundaries/terms quarantine. Top-ups retain **provider/payment UUID + purpose** identity, so distinct purchases each grant once.

| Phase | Gated outcome |
|---|---|
| 0 | Only CI-proven fixes, fixtures and test mappings |
| 1 | DB catalog, **draft/disabled no-card seed**, sole migration and restricted CLI |
| 2A | Exclusive access, canonical ledger, refunds/expiry/locks |
| 2B | Actual BYOK routes, encrypted custody, safe authenticated HTTP |
| 2C–2D | Content then current Growth narration metering/recovery |
| 3 | Canonical subscription-period grants, verified funding and recoverable webhooks |
| 4 | Implement/test **open no-card claim**, then audited operator enablement; offers/add-ons/top-ups/changes and disabled future card trial |
| 5 | Existing pricing/billing/provider UI, account states and browser tests |
| 6 | Review/simplify, operational guide, rollback and final gates |

Preserve caller-derived lock order and keep network outside transactions. No sponsor transfer, admin dashboard, duplicate wallet, tax/FX engine, streaming or nested paid-tool framework.

## Verification and operation
Mapped checks per phase, including disabled-to-gated campaign enablement, two valid same-period receipts→one bundle, duplicate delivery→same effect, two periods→one each, two top-ups→one each and conflicting boundaries→quarantine. Final `scripts/check.ps1` then `scripts/test.ps1`, clean reset and zero ORM drift. **No full local backend suite.** Require full GitHub backend/frontend/build/E2E/contract/security/Compose owners on the implementation SHA; skipped owners are pending.

Deliver tested exact CLI examples in `docs/operations/billing-operator-guide.md`, including authorization, configuration, corrections, inspection, rotation and recovery. Rollback restores old immutable terms for **future purchases only** and compensates history append-only; stop new affected work/checkout while preserving settlement/reconciliation/cancellation. Disposable schema rollback never implies production downgrade.

Attach `billing-consolidation-designs/design-plan.json` and its five artifacts: pricing-disabled, billing/usage, **no-card claim**, future card consent and **actual BYOK configuration**. Exact HTML paths are in the detailed plan; unchanged final-state mocks do not imply Phase 1 availability or live readiness.
