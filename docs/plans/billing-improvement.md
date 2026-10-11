# Billing, entitlements and usage improvement

Feature 11 of the [feature review programme](../archive/feature-review-tracker.md),
started 2026-10-11 from the [backlog](backlog.md#billing-entitlements-and-usage-review).
Owner documents: [Billing and entitlements](../billing-entitlements.md) and
[provider readiness](../billing-provider-readiness.md).

## Objective

Billing works end to end in the deployed environment while staying hidden from
customers. Enabling it is then one small PR: configuration values and live keys,
with no code paths, routes, infrastructure or UI built at enablement.

The priority is **coverage, not pricing** ([B0](../billing-decisions.md)): every
feature is gated by a plan capability and every call that costs the platform
money is accounted for or explicitly exempt. Prices, allowances and rates are
configuration and can change at any time without code.

Hidden means: public pricing keeps its coming-soon view, no customer workspace can
start checkout, and in-app billing does not advertise purchasable plans. The
operator can still run the full purchase, renewal, change, refund and cancellation
cycle from an allow-listed workspace.

## Inventory

About 10k lines across `services/api/src/billing` (20 modules),
`src/entitlements` (8), `src/config/billing*.{ts,json}`, `entitlements.json`,
`components/billing` (16) and `lib/billing`. Routes: the `billing` and
`billing-documents` families. Jobs: the `billing` runner lane (recovery,
abandonment, renewals) on the 10-minute tick. Webhooks enter through the marketing
apex Worker (`citeladder.com/api/v1/billing/webhooks/razorpay`); the api and app
host Workers do not proxy them. Tests: about 42 API cases (mostly real-database)
and about 64 frontend cases.

Checkout availability is one server predicate, `checkoutAvailable()`
(`razorpay.ts:121`), which every surface follows through `GET /billing/catalog`.
That is the right shape to keep; the work below makes it reachable and correct.

## Verified findings

Severity: **B** blocks operation, **I** important, **M** minor. Parameters:
correctness (C), usability (U), performance/cost (P).

### Access and plan bundles

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 1 | B·C | Buying a plan locks a public customer out. Plan bundles carry no `workspace_access`, and `workspaceAccess` requires it for public accounts, so the paid primary bundle displaces the trial and access becomes `access_unresolved`/`trial_expired`. Tests mask it by granting `workspace_access` directly. | `catalog-authoring.ts:305-327`, `access.ts:26-46`, `test/support.ts:75` |
| 2 | B·C | Paid plans never grant `team_members` or `project_deletion`, so invitations and project deletion are refused on every plan. Launch config has no seat surcharge. | `invitations.ts:86`, `projects/service.ts:440` |
| 3 | I·U | A lapsed paying customer reads as "Your trial has expired"; there is no lapsed-subscription state. | `entitlements/access.ts` |
| 4 | I·C | Granted limits that nothing enforces: `audit_cadence` (any account can schedule every N minutes), `fanout`, `exports`, `support_tier`; `history_window` only bounds integration sync. Never read: `serp_tasks_per_period`, `provider.*`. Search Intelligence, Commerce and MCP have no capability. | `schedule-inputs.ts:68`, `freeze.ts:413`, `integrations/sync.ts:303` |
| 5 | I·C | Prompt slots are checked only on add; after a downgrade, audits keep measuring prompts above the new limit. | `occupancy.ts:259` |
| 6 | M·C | Project and prompt occupancy fail open when the grant is absent; markets and API keys fail closed. | `occupancy.ts:49,116` |

### Payment paths

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 7 | B·C | Checkout SDK name mismatch: the API returns `razorpay`, the frontend dispatches only `razorpay-checkout`, so every checkout shows "unsupported". | `routes/billing.ts:270`, `lib/billing/razorpay-checkout.ts:13` |
| 8 | B·C | One declined attempt marks an order failed; Razorpay lets the customer retry on the same order, and the paid retry is quarantined as `payment_for_closed_intent`, so money is captured with no grant or receipt. Affects add-ons, top-ups and upgrades. | `razorpay.ts:306-313`, `settlement.ts:82-89,232-243`, `recovery.ts:86` |
| 9 | I·C | `halted` is terminal: the row ends, the provider subscription is never cancelled, a later charge after a mandate fix is ignored, and a second base subscription becomes purchasable. With a paid period remaining, the sweep cancels a subscription that resumed. | `config/billing.ts:36`, `settlement.ts:42,411,421-441`, `recovery.ts:441,470` |
| 10 | I·C | A fully refunded subscription payment maps to failed, so `subscriptionEvidence` throws `provider_invoice_mismatch` on every sweep and webhook for that subscription. | `razorpay.ts:161-165,341-348` |
| 11 | I·C | A definite provider refusal of a retried cancellation throws out of the sweep, which then never applies renewals or terminal states again. | `recovery.ts:490-497,523` |
| 12 | I·C | `payment.*` events with neither order nor invoice (payment links, QR) return 400; sustained failures can make Razorpay disable the endpoint. | `webhooks.ts:66-73` |
| 13 | I·C | Orders have no expiry and abandonment only flips local state, so a capture after abandonment is stranded with no receipt or refund path. | `razorpay.ts:259-264`, `recovery.ts:236-247` |
| 14 | I·P | Recovery lists the whole provider account (capped at 500 rows) and then throws `provider_collection_incomplete` forever; an uncertain base intent never abandons and blocks new purchases. | `razorpay.ts:223-235,272-285` |
| 15 | M·C | Kill switch blocks no-payment downgrades; the Downgrade button stays enabled and fails after confirmation. Verify returns 409 after quote expiry for a valid payment. | `purchases.ts:547-581`, `plan-changes.tsx:108`, `routes/billing.ts:293` |
| 16 | Verify | Unconfirmed against Razorpay: subscription `updated_at` (used as the stale-evidence version) and `cancel_at_cycle_end` fields; `PATCH /subscriptions` for UPI and eMandate mandates. Settled in test-mode acceptance, with a defined fallback if refused. | `razorpay.ts:21-22,154,367-375` |

### Hidden operation and deployment

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 17 | B·C | No `BILLING_*`/`RAZORPAY_*` env or secret reaches Cloud Run. Recovery runs in the runner job, so billing secrets belong in the shared secret set. | `infra/gcp/locals.tf:14-95`, `gcp-deploy.yml:189-292`, `workers/runner.ts:286` |
| 18 | B·C | Test mode is refused under `APP_ENV=production`, and production is the only environment, so the cycle cannot be exercised before live keys. | `razorpay.ts:117`, `infra/gcp/locals.tf:68` |
| 19 | B·C | No allow-list: once the predicate is true, every workspace can buy and marketing drops coming-soon for everyone. | `public-pricing-catalog.tsx:248` |
| 20 | B·C | Binding Razorpay plan references (or adding India prices) requires a new catalog revision name, because `initializeCatalog` publishes v1 once and `importCatalog` rejects a different payload under an existing name. No Cloud Run job or runbook runs `billing:plans`/`billing:admin` against the private database. | `admin.ts:100-107,284-335`, `plan-operators.ts:29-42`, `run.tf:88` |
| 21 | B·C | Seller identity values already decided on 24 September (legal name, address, GSTIN, state, email) default to empty; quotes refuse without them. | `billing.json:19-53`, `quotes.ts:59-70` |
| 22 | I·C | India prices: plans emit INR only when the GST rate and approval reference exist, items always do, so India add-ons read `available` but quote `checkout_unavailable`. The GST rate is frozen in the catalog and re-read at quote time (two authorities). | `catalog-authoring.ts:296,391`, `reads.ts:35-38,86`, `quotes.ts:78-87` |

### Surfaces

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 23 | I·U | Expired trials hit a dead end ("Contact support"); `/billing` is not reachable without access. | `workspace-access-gate.tsx:136`, `lib/project/bootstrap.ts:60` |
| 24 | I·U | Limit refusals show developer text naming internal keys (`prompt_slots allowance`); project-limit and invite notices have no route to billing; `fact_checking_not_in_plan` is unhandled. | `occupancy.ts:281-289`, `onboarding-page-client.tsx:93`, `workspace-panel.tsx:74` |
| 25 | I·U | In-app billing shows USD list prices and "checkout unavailable" buttons while marketing hides prices in the same state. | `reads.ts:86`, `plan-row.tsx:99-105`, `nav-items.ts:92` |
| 26 | M·U | No resume for a scheduled cancellation; cancel errors render twice. | `current-plan.tsx:117-205` |

### Cost

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 27 | I·P | Platform-key model calls with no ledger, entitlement or cost record: prompt generation and judge, Commerce buyer prompts and shelf, project research, perception and fact verification. Only abuse limits bound them. | `prompts/generation.ts:386`, `projects/research.ts:92`, `perception/model-call.ts:27` |
| 28 | I·P | The funded monthly budget sums reservations and never settles to recorded spend, so failed, cancelled and BYOK-bound audits count fully (fails closed). | `admission.ts:141-165`, `creation.ts:454` |

### Debt

- About 60 unreferenced `contracts` keys in `billing.json`; unused HTTP pool
  settings; `api_base_url` must equal a constant; contact URL defined twice;
  `account_grants.catalog_revision` holds three kinds of revision.
- `maintainLease` and `lockOwner` duplicate queue and settlement helpers; note
  verification is written three times; the three recovery probes repeat one
  claim/lease/release skeleton.
- `purchases.ts` mixes HTTP schemas with domain logic; plan change (about 340
  lines) belongs in its own module, which also removes the recovery → purchases
  import.
- Vestigial: the card-trial quote route, `funded` and `trial_requested` accepted
  then refused, always-empty `checkout_url`/`redirect_url`, `billing:backfill`
  naming.
- Documentation drift: `entitlements-v5/v6/v7` in the owner document (code is
  v1), missing webhook events and readiness flags in the owner requirements, the
  webhook host, and a `BILLING_PAST_DUE_GRACE_DAYS` that does not exist.
- Tests: plan-bundle access is masked by direct grants; no coverage for a
  purchasable catalog, downgrade under closed checkout, a retried order payment
  or the trial-expired → billing path. Two tests assert copy or absent vocabulary.

## Decisions

Every billing decision, owner or engineering, is recorded once in the
[billing decision log](../billing-decisions.md); entries are cited below as B*n*.

## Phases

Three PRs, built in order; each merges and syncs `main` before the next branches.
Each keeps billing hidden and leaves the repository releasable.

### PR 1 — Correct the commercial lifecycle

Findings 1–3, 5, 7–15, 22 and the payment-path debt.

- Checkout SDK name aligned between API and frontend.
- Plan bundles grant `workspace_access`, `team_members` and `project_deletion`;
  tests stop granting them directly and buy a plan instead.
- A distinct lapsed-subscription access state and copy.
- Order failure only on abandonment; a late capture settles instead of
  stranding (B25; Razorpay orders cannot be expired).
- Halted subscriptions cancel at the provider (no orphan, no second base) and
  the row stays reconcilable until that cancellation is confirmed (B24).
- Refunded subscription payments reconcile; definite cancel refusals are
  terminal, not sweep-breaking; unsupported payment events are acknowledged.
- Recovery queries by receipt/subscription id instead of listing the account.
- Over-limit prompts after a downgrade are excluded from measurement, with the
  excluded state shown (not deleted).
- Plan change moves to its own module; lease and lock helpers reuse existing
  owners.

Acceptance: real-database tests for purchase → access, retry after a decline,
halted → resumed, full refund of a renewal, abandoned-then-captured, and recovery
above 500 provider rows.

### PR 2 — Plans, AI credits and enforcement

Findings 4, 6, 27, 28 under B4–B20, B23 and B31–B39.

- The credit unit, token prices and allowances (B14, B16); the AI top-up open to
  every paid plan and refused on the trial; customers see credits only (B23).
- One platform-AI metering owner charges every platform model call, onboarding
  included (B31), holding credits before dispatch and settling tokens at the
  serving model's price once (B35). Analysis calls are recorded as included; JEV,
  Tavily and Keenable are recorded but not charged (B13). The gateway and those
  clients refuse an unmetered call (B18). The Agent uses the same prices and ledger.
- `prompt_runs_per_period` replaces `audit_credits` and `successful_answers`;
  every answer holds a run at admission and only a recorded answer spends it
  (B33, B34).
- `commerce` and `search_intelligence` capabilities; the dropped capabilities
  removed; occupancy fails closed (B38).
- Managed plans purchasable at their own prices, measuring on platform keys with
  provider settings hidden (B32, B37); the budget admits on recorded spend (B36).
- The Agent custom model removed (B19); dead keys, settings and vestigial routes
  removed (B39).

Acceptance: real-database tests for the coverage matrix (charged, included or
recorded as listed), a scheduled audit refused when runs are exhausted, a trial
refused a top-up, and the bypass test refusing an unmetered call.

### PR 3 — Operational but hidden

Findings 16–21, 23–26 under B2, and the owner documents.

- The `billing_checkout` allow-list inside `checkoutAvailable(workspace)`; test
  mode in production only for allow-listed workspaces; the public catalog stays
  unavailable.
- Every billing variable and secret declared in Terraform and the deploy
  workflow as optional, in the shared secret set, defaulting to disabled.
- Seller identity set from the recorded decisions; the GST rate has one
  authority.
- Catalog revisions replaceable before first publication with provider
  references; a Cloud Run job or runbook step binds plans and publishes.
- In-app billing follows the same availability signal as marketing;
  trial-expired and limit refusals route to `/billing` with readable copy;
  resume a scheduled cancellation.
- Owner documents rewritten from the shipped behaviour, including the webhook
  host, event list and variable names in the owner requirements.

Acceptance: with the gate on for one workspace and test keys, the operator
completes plan purchase, upgrade, downgrade, add-on, top-up, refund, cancel and
resume in the deployed environment; every other workspace and the public site
still show checkout unavailable.

### Operator acceptance (not a PR)

Test-mode acceptance in production through the allow-list, covering finding 16
and the [sandbox evidence](../operations/razorpay-and-demo-owner-requirements.md#8-required-sandbox-acceptance-evidence).
Requires the owner's Razorpay test keys and explicit authorization for provider
calls.

### Enable PR

Live keys and readiness flags, `BILLING_CHECKOUT_ENABLED=true`, the allow-list
gate opened to all workspaces (configuration, not code), and the India tax
inputs if India launches together. No other change.
