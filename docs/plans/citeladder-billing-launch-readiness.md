# CiteLadder billing consolidation and launch readiness

## Outcome, authority, and working agreement

Deliver the complete launch billing journey by extending the existing catalog, billing, entitlement, provider, and ledger owners. Preserve working functionality; remove superseded billing paths only when their replacements are verified.

**Immediate next action after approval and leaving Plan mode:** save this detailed plan as `docs/plans/citeladder-billing-launch-readiness.md`, then stop. Implementation begins in a later session.

- **Astra:** architecture, phase boundaries, findings adjudication, final review and simplification.
- **Luna High:** read-only exploration, test execution, and evidence collection.
- **Terra Medium:** bounded implementation assignments after approval.
- Work sequentially where owners overlap. Recheck Sol’s merged code before assigning fixes.
- No live checkout, provider mutations, deployment, or refund execution is authorized by this plan.

### Approved commercial decisions

These supersede conflicting sections of the sample launch configuration:

| Area | Agreed behavior |
|---|---|
| Paid plans | Use the document’s exact INR/USD prices, funding variants, allowances, and eligibility. Publish changes through immutable catalog revisions. |
| Discounts | No launch discount. Preserve valid existing arithmetic and evidence fields; do not build a coupon system. |
| Plan/funding changes | Effective at the next renewal; no midperiod proration. |
| Add-ons | One-time purchases of additional capacity at the configured full price; immediate activation after verified payment. |
| Top-ups | One-time credit purchases at the configured full price; immediate activation after verified payment. Preserve the configured answer/workflow SKU distinction and eligibility. |
| Expansion expiry | Thirty days from successful payment, or earlier when continuous paid subscription access ends. Carry across uninterrupted renewals; no automatic repurchase or resurrection after expiry. |
| Regional expansion prices | Unconfigured INR prices remain unavailable. Never derive them from FX. |
| Trial | Public seven-day, no-card offer; 20 prompt slots; ChatGPT only through the verified OpenAI route; one successful run per prompt and at most 20 successful answers overall. No repeated runs or multiple engines. |
| Other trial limits | Retain one project, 20 monitored URLs, no Content/Growth Agent access, and zero workflow credits. No automatic charge or daily answer reset. |
| Refunds | Initiated externally by the operator. CiteLadder reconciles confirmed refunds; a full refund revokes that purchase’s remaining grants. No usage-based refund calculator. Partial refunds are recorded without proportional entitlement adjustments. |
| Excess occupancy | Preserve data and historical reads. Require an owner-selected active set within reduced limits before affected execution resumes. |

Trial allowance must be lifetime-bounded for the claim: deleting/recreating prompts, switching workspaces, or retrying requests cannot replenish it.

## Current evidence and confirmed findings

Read-only review began at `49c69c93` and rechecked the supplied findings at **`42ed742f`**. Sol was actively changing the branch during review. No tests or payment acceptance flows were executed in this planning session.

**Already implemented:** persisted catalog revisions, server-generated quotes, transaction tax snapshots, subscription checkout, signatures, normalized payment evidence, receipt-gated activation, recurring periods, entitlement ledgers, owner-authorized PDF downloads, and isolated test-stack reconciliation.

**Resolved during review:** receipt-download failures now display a retryable error, with a new regression test. Do not reimplement this fix.

| Finding | Status at `42ed742f` | Planned treatment |
|---|---|---|
| #1 Negative frozen tax | Confirmed in `billing_catalog.py` | Validate at catalog admission; retain a regression fixture. |
| #2 Expansion price gates weaker than plan gates | Confirmed | Unify policy before enabling expansions. Currently the published catalog omits these products, limiting exposure. |
| #3 Incomplete webhook runbook | Confirmed | Reconcile documented events with the implemented payment/refund contract. |
| #4 Invalid anonymous country intent | Confirmed | Validate before storage and again on resume; backend remains authoritative. |
| #5 Concurrent checkout state overwrite | Confirmed | Serialize starts and bind status updates to their persisted activation. |
| #6 Silent evidence rejection | Confirmed | Add redacted identity/catalog context to actionable diagnostics. |
| #7 Exhausted webhook recovery stays pending | Confirmed | Persist terminal failure and expose operator recovery. |
| #8 Fixed webhook retry delay | Confirmed | Reuse bounded, config-owned exponential backoff. |
| #9 Generic configuration assertions | Confirmed | Assert the actual intended guard messages. |

Additional verified contract gaps:

- The persisted catalog omits expansion products and regional funded pricing; validation still embeds earlier commercial amounts.
- Base checkout currently permits BYOK only; expansion quote paths also force BYOK.
- Add-ons currently follow monthly-subscription semantics, conflicting with the newly agreed one-time model.
- Expansion buttons do not complete the provider payment/status journey.
- Visibility metering currently debits provider attempts, including failures; the approved contract charges successful answers.
- Remaining scheduled-answer protection and pooled period page-fetch accounting are missing.
- Trial claims reuse the paid Tier 1 bundle rather than dedicated trial terms.
- Refund adapter/receipt primitives exist but are not connected to refund reconciliation and grant revocation.
- The isolated billing stack runs continuous recovery; an equivalent production deployment and monitoring arrangement remains unverified.

These findings determine work only after revalidation against the implementation baseline.

## Five dependency-ordered phases

### Phase 1 — Establish one commercial and entitlement authority

**Owners:** `backend/app/domain/billing/catalog_revisions.py`, `backend/app/core/config/billing_catalog.py`, entitlement configuration, catalog projections, and launch documentation.

- Reconcile the launch document with the decisions above, removing contradictory active guidance.
- Extend the persisted catalog to express both funding variants, regional prices, expansion SKUs, quantities, eligibility, trial-specific grants, expiry policy, and required execution policies.
- Replace hardcoded historical commercial-value assertions with structural and safety validation.
- Retain stable plan IDs and exact revision provenance. New publication never changes accepted prices, invoices, or grants.
- Add missing entitlement definitions, particularly pooled period page fetches; reuse existing ordinals and occupancy owners.
- Use one availability policy for every purchasable item: explicit environment, configured currency/region/mode, verified provider binding, tax readiness, and execution readiness where applicable.
- Remove runtime dependence on legacy environment catalogs once every caller uses persisted or frozen terms.

**Interfaces:** extend existing catalog schemas and `/api/v1` projections; no second catalog API or configuration authority.

**Exit evidence:** every approved SKU/variant is representable; unavailable combinations fail closed; quantity scales charge and grants together; frozen historical terms survive new publication.

### Phase 2 — Complete payments, lifecycle, and recovery

**Depends on:** Phase 1.

**Owners:** existing billing routes, quotes, checkout, activations, periods, payments, provider adapter, webhook and reconciliation modules.

- Complete Managed AI and BYOK base checkout through the existing activation owner.
- Convert feature add-ons to one-time purchases, sharing the existing one-time payment mechanism with top-ups while preserving distinct grant semantics.
- Freeze purchase terms, quantity, parent subscription identity, and 30-day expiry. Renewal may preserve expansion eligibility but never extend its original expiry.
- Complete next-renewal tier/funding transitions. Permit only one pending base transition; expose its effective date and cancellation.
- Use verified provider updates where supported. Where a payment method cannot update safely, require explicit reauthorization for a replacement after the old paid period ends; never silently create overlapping subscriptions.
- Preserve cancellation through verified paid-through time. Failed or merely authorized renewals grant no new allowance.
- Reconcile externally initiated refunds using provider refund identities and append-only evidence. Only processed refunds affect access; duplicate notifications have no additional effect. Cumulative full refunds revoke remaining grants from the original purchase.
- Add terminal recovery failures, bounded backoff, redacted rejection diagnostics, and explicit operator retry through existing ownership.
- Preserve recovery while new checkout is disabled.

**Interfaces:** extend existing billing contracts for transition intent/status, one-time checkout initialization, recoverable purchase status, and refund history. Refund initiation remains outside CiteLadder.

**Exit evidence:** browser-free recovery converges on one payment receipt, one document identity, and one correct grant bundle. Unknown provider outcomes trigger discovery/reconciliation before any new charge request.

### Phase 3 — Enforce allowances, funding, and the public trial

**Depends on:** Phase 1 contracts and Phase 2 paid-period identities.

**Owners:** existing entitlement ledger/resolver, audit admission and settlement, scheduler, Site Health runtime, Content worker, Agent model attempts, and introductory campaign owner.

- Separate customer answer charging from provider attempt costs: reserve before execution, debit once per successful logical sample, release failed work, and retain actual attempt costs separately.
- Protect remaining scheduled answers using actual paid-period boundaries and configured schedules. Recalculate atomically when prompts or schedules change; optional manual work cannot consume the protected allocation.
- Add pooled period page-fetch accounting under the existing ledger/runtime ownership. Define billable acquisition attempts consistently across scheduled/manual crawls; cached reads consume nothing.
- Verify project/prompt/URL occupancy and feature limits across UI, API, scheduler, MCP, and Agent entry points.
- Complete workflow AI-credit enforcement using verified route-specific cost policies, finite call caps, integer rounding, and durable reservation/settlement. Unknown usage must remain explicit.
- Preserve explicit BYOK routing and no fallback. Subscription BYOK pricing governs visibility funding; retain existing independently configured workflow routing behavior without introducing a second ledger.
- Implement the dedicated public trial through the existing campaign/claim owner. Require verified account eligibility, lifetime claim uniqueness, bounded admission/rate controls, and a campaign kill switch before public enablement.
- Implement expansion expiry across renewal, cancellation, refund, and payment gaps. Preserve data on capacity loss; enforce the owner-selected active set.

**Exit evidence:** exact launch allowances and scheduled-coverage fixtures pass; failed/system-duplicate answers charge zero; Content/Agent cannot exceed approved budgets; trial execution cannot exceed 20 successful answers.

### Phase 4 — Finish the customer journey and documents

**Depends on:** Phases 1–3 behavior and contracts.

**Owners:** existing pricing components, shared checkout controller, pending-intent handling, Billing Settings, document history, and billing API schemas.

- Use one checkout controller for subscription and one-time purchases, with serialized starts and activation-bound callbacks/polling.
- Validate country before anonymous persistence and on resume. Clear stale/account-mismatched intents.
- Restore pending purchase status after reload/login without creating a replacement purchase.
- Show server-authoritative price, currency, tax, zero discount, quantity, and exact expiry before confirmation.
- Add complete expansion purchasing, pending plan changes, paid-through cancellation, renewal-failure/recovery, refund history, and capacity-selection states.
- Explain trial terms plainly: 20 prompts, one ChatGPT result each, seven days to use the offer.
- Verify invoice and receipt viewing/downloads on desktop and mobile, including authenticated access, empty/loading/failure/retry states and long document content.
- Keep billing documents tied to immutable payment/tax evidence. Obtain CA approval for document labels and refund credit-note requirements; do not imply an amended historical invoice.

**Exit evidence:** customers can complete every enabled flow and recover from interruption without misleading success or lost status.

### Phase 5 — Prove readiness and perform Astra’s final review

**Depends on:** all earlier phases.

- Revalidate every supplied finding and audit gap against the final commit; distinguish fixed, superseded, unsupported, and externally unverified.
- Run the matrix below with automated failure injection and real Razorpay test-mode acceptance.
- Verify deployment recovery, alerts, operational commands, test/live isolation, ordinary free accounts, and explicit development bypass boundaries.
- Astra reviews ownership, locking, provenance, contracts, simplification, and obsolete-path removal. Remove unnecessary wrappers and duplicate policy only where replacement is proven.
- Record exact commands, commit, catalog revision, environment, outcomes, and limitations.
- Produce the final launch verdict and remaining owner/CA/provider decisions.

## Risk-based test matrix and evidence requirements

Existing coverage is code-inspected, **not freshly executed**. Relevant suites include billing quote/checkout/API/commercial/invoice tests, entitlement tests, funded-worker tests, frontend component tests, and mocked billing E2E at desktop/mobile widths.

| Priority | Scenarios | Required proof / current gap |
|---|---|---|
| P0 | All tiers, modes, regions and eligible expansions | Server quote equals captured amount, tax evidence, document totals and exact grants. Expansion/funded launch coverage missing. |
| P0 | Duplicate callbacks/webhooks, reordered delivery, webhook/reconciliation races | Exactly one receipt and grant bundle per valid purchase/period. Existing primitives covered; extend to expansions/refunds. |
| P0 | Concurrent clicks, tabs, workers and different retry keys | No duplicate application-created chargeable purchase; uncertain creation is discovered before retry. Frontend serialization coverage missing. |
| P0 | Abandonment, authorization-only, failed/pending payments, forged signature | No paid access or credits without verified payment. Extend complete journeys. |
| P0 | Capture succeeds, browser disappears, webhook is delayed/missing | Background reconciliation restores correct access without browser return. Require real sandbox evidence. |
| P0 | Crash before/after provider call, receipt insert, document issuance or grant commit | Durable recovery converges without double charge/grant; ambiguous outcomes remain visible. |
| P0 | Successful/failed renewals, delayed recovery, cancellation, plan changes | One bundle per paid period; no unpaid period grant or stale-event resurrection. Transition coverage missing. |
| P0 | Failed/retried/duplicate visibility and workflow execution | Correct answer versus cost accounting; no duplicate debit; reservations released/recovered. Existing attempt-charge expectations must change with the approved behavior. |
| P0 | Cross-account documents, activations, purchases and workspace usage | Authorized ownership on every read/mutation; no ID-only access. Existing coverage extended for new contracts. |
| P1 | Full/partial/pending/failed refunds; duplicates and cumulative full refund | Processed evidence only; correct purchase-specific revocation; no historical usage rewriting. Integration coverage missing. |
| P1 | Thirty-day expiry, continuous renewal, cancellation, unpaid gap, resubscription | No extension, resurrection, automatic purchase, or unintended loss across a valid renewal. |
| P1 | Public trial replay, concurrent claim, prompt replacement, multi-workspace access | One eligible trial; one engine; maximum 20 successes; no paid-feature escape. |
| P1 | Leap February, month boundaries, schedule changes and concurrent manual work | Actual-period reserves, pooled allowances, correct reset and rollover behavior. |
| P1 | Script/network failure, polling timeout, interrupted redirects, downloads | Clear success/pending/failure/retry states on desktop/mobile. Existing happy-path mocks are insufficient. |
| P1 | Mode mismatch, synthetic live prices, missing tax/provider/rate evidence | Fail-closed checkout/execution; recovery remains available under checkout kill switch. |
| P2 | Terminal retry exhaustion and operator replay | Persisted reason, alert, bounded backoff and idempotent recovery. Coverage missing. |

After each completed implementation phase, follow repository completion gates: `.\scripts\check.ps1`, then `.\scripts\test.ps1`. Do not run gates after every edit. Luna executes the repository-selected scope; retry `-ChangedFiles` includes the complete fix delta. No local full-backend-suite substitution or weakened gates. Schema changes retain the single baseline and require an explicitly disposable database for migration/drift verification. CI remains authoritative.

## Launch, reconciliation, and rollback criteria

**Official-source constraints:** Razorpay documents duplicate/out-of-order webhook delivery and bounded provider retries, so durable reconciliation is mandatory. Subscription updates have payment-method restrictions; refund events distinguish processed from failed outcomes. [Webhook guidance](https://razorpay.com/docs/webhooks/best-practices/?preferred-country=IN), [subscription updates](https://razorpay.com/docs/payments/subscriptions/update/?preferred-country=IN), [refund events](https://razorpay.com/docs/webhooks/refunds/).

**CA confirmation required:** seller registration/SAC, GST rate and rounding, place-of-supply rules, export eligibility/LUT and remittance evidence, invoice numbering/content, and credit-note treatment. Currency alone does not establish export treatment. Unapproved treatments remain unavailable. [CBIC export guidance](https://cbic-gst.gov.in/sectoral-faq.html), [CBIC invoice requirements](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001).

**Reconciliation acceptance**

- Every known captured payment resolves to matched receipt/document/grants or an explicit actionable discrepancy.
- No silent exhausted work, duplicate chargeable intent, duplicate grant, or unresolved launch-test financial mismatch.
- Demonstrate worker outage/restart, missing webhook recovery, operator replay, and checkout-disabled recovery.
- Production worker scheduling and alert delivery must be observed, not inferred from local Compose.

**Launch gate**

- All P0/P1 scenarios pass for each enabled product/method.
- Required repository gates and CI pass.
- Provider plans, merchant capabilities, tax policy, execution rates/capacity, public-trial controls, document access and recovery monitoring are evidenced.
- Unsupported combinations stay unavailable with clear reasons.
- CiteLadder explicitly approves live readiness.

**Rollback/containment**

- Any duplicate charge/grant, unpaid access, incorrect amount/tax, cross-account disclosure, or broken recovery is a stop-sale condition.
- Disable new checkout and affected campaigns/executions while preserving webhook ingestion, reconciliation, paid evidence and history.
- Correct catalog mistakes through forward publication; correct financial/access evidence through audited append-only actions.
- Do not reset a database containing payment evidence or cancel/refund customers automatically as a rollback shortcut.

**Live smoke test**

Test-mode validation never authorizes live payment. A separate approval must identify the operator, account, SKU, amount/currency, payment method, expected evidence, refund/cancellation action, and stop conditions. No broad live checkout enablement follows automatically from a successful smoke test.
