# Billing and entitlements

## Responsibility

Billing owns workspace commercial accounts, published offers, purchase intent,
subscriptions, normalized payment/refund evidence and invoices. Entitlements
owns effective access, occupancy and consumable accounting. An intent, redirect
or provider authorization is not paid access. Payments remain disabled by
default; implemented adapters are not evidence of provider acceptance.

## Commercial authority and access

[Workspace billing lookup](../frontend/services/api/src/billing/purchases.ts) resolves
the one persisted account for a workspace. Python's
[account provisioning](../backend/app/domain/billing/accounts.py) remains a bridge
for workspace bootstrap until the separate auth/workspace migration merges.
Owner-user metadata is not a payer-selection rule.
[Workspace roles](workspace-access.md) gate billing and credentials to
Owner/Admin; product Members receive safe effective allowances rather than
private billing records.

[Catalog revisions](../backend/app/domain/billing/catalog_revisions.py) is the
runtime commercial authority. Validated revisions are immutable, and publication
retires the former published revision. [Launch catalog](../backend/app/domain/billing/launch_catalog.py)
authors `launch-pricing-v1`; regional amounts are frozen at authoring by the
[currency rule](../backend/app/core/config/billing_pricing.py) and never
converted at runtime. India is charged in INR plus GST; every other country in
USD. Add-ons and top-ups are one-time catalog items: their grants last
`expiry_days` after purchase or until the base subscription ends, whichever is
earlier, and require an eligible live plan. Subscriptions and periods freeze catalog
identity, credential mode, price, quantity and terms. Corrections use reviewed
forward-publication, never rewriting historical terms.

The [TypeScript resolver](../frontend/services/api/src/entitlements/resolve.ts) chooses the active
primary profile, falling back to the free baseline, then applies deliberate
supplements. Grants/revocations remain append-only. Occupancy admission uses
locked current counts; reads expose persisted/current projections without
repairing provisioning or acquiring admission locks. Missing authority is not
unlimited access. The TypeScript prompt writers resolve the same grants and
admit prompt slots in [`src/entitlements/`](../frontend/services/api/src/entitlements/),
under the account capacity lock Python's
[enforcement](../backend/app/domain/entitlements/enforcement.py) takes
(a personalized BLAKE2b of `OCCUPANCY_LOCK_NAMESPACE` and the account id), so
Python Commerce and project writers and TypeScript prompt writers serialize on
one key.

## Explicit purchase to settlement

[Billing API](../frontend/services/api/src/routes/billing.ts),
[purchases](../frontend/services/api/src/billing/purchases.ts) and
[quotes](../frontend/services/api/src/billing/quotes.ts) validate the selected
offer and billing details and commit pending intent before provider I/O.
Intent freezes the originating provider and environment. Changing the default
must not reroute an old record or retry an uncertain creation through a different
provider.

[Webhooks](../frontend/services/api/src/billing/webhooks.ts) and bounded
[recovery](../frontend/services/api/src/billing/recovery.ts) converge on
[settlement](../frontend/services/api/src/billing/settlement.ts). Authenticated
payment/subscription evidence, period identity and stable grant keys make
settlement idempotent. Duplicate event IDs with conflicting digests quarantine.
Normalized refunds cannot exceed payment value. Redirects grant nothing.
[Receipts](../frontend/services/api/src/billing/receipts.ts) issue one receipt per
captured payment and one credit note per processed refund, each series
consecutive per financial year. A full refund revokes the purchase's remaining
grants; consumed units are not clawed back. Refunds arrive as provider refund
events and settle against the original payment receipt.

Receipt list/download reads and PDF rendering are TypeScript-owned in
[`src/billing/`](../frontend/services/api/src/billing/). The `billing-documents`
route family contains the existing invoice paths; the `billing` family owns
the commercial mutations. Reads require the active workspace's billing
permission and select its account, independently of owner-user metadata. A
workspace without an account reads as having no receipts; reads never
provision one.
Documents validate stored amounts and use local Noto Sans fonts with measured
wrapping and pagination. Unsupported glyphs are printed as explicit Unicode
code points instead of blank characters. Executive PDFs consume the existing
[command-center projection](../frontend/services/api/src/projects/command-center.ts),
including measurement versions, source identities and the non-causal action
disclaimer. Rendering performs no acquisition or settlement.

Base plans are recurring provider subscriptions. Add-ons, top-ups and an
upgrade's prorated charge are one-time provider orders: the intent persists the
order, and the single captured payment on it settles the purchase, so both
order-paid and payment-captured deliveries converge on one activation. An
unpaid checkout is abandoned after the reconciliation window instead of holding
the one-pending slot; for a base-plan intent the provider subscription is
cancelled first, and a failed cancellation keeps the intent pending for retry.
[Plan changes](../frontend/services/api/src/billing/purchases.ts) edit the one base
subscription: an upgrade charges the prorated base-price difference for the rest
of the paid period and, once paid, issues the higher plan's bundle for that
remainder; a downgrade waits for renewal with no refund. Either way the
subscription holds at most one scheduled change carrying the target plan's
frozen terms, which the renewal billed on the target provider plan swaps in.
Existing subscribers stay on the provider plan and terms they authorised;
each catalog revision names one immutable provider plan per SKU and region.

The [Razorpay REST client](../frontend/services/api/src/billing/razorpay.ts)
fails closed for unknown or unconfigured providers and fixes the credentialed
origin, disables redirects and bounds timeouts and collection pagination.
Checkout initialization (one route for every activation kind) exposes only safe
public identity. Callback verification binds its signature to the stored
subscription or order and schedules bounded reconciliation; durable webhook receipt precedes asynchronous processing. The
checkout kill switch does not disable recovery of existing payment evidence.
Razorpay vocabulary, headers, keys and webhook path remain adapter-owned.
The [billing worker](../frontend/services/api/src/billing-worker.ts) claims each
row with PostgreSQL leases, renews during provider I/O and checks ownership
before settlement. Attempts and retry bounds persist across process restarts;
uncertain evidence never establishes nonpayment. Exhausted claims require
operator inspection. Recovery preserves originating provider/mode and historical
grant UUIDs, period keys and receipt digests across the cutover.
[Provider readiness](billing-provider-readiness.md) owns selection and acceptance
conditions; [operator procedures](operations/billing-operator-guide.md) own
explicit-target, reasoned, dry-run-reviewed administrative operations.

## Metered execution

[TypeScript grant writes](../frontend/services/api/src/entitlements/grants.ts)
and the [ledger](../frontend/services/api/src/entitlements/ledger.ts) own the
migrated billing boundary. Python
[metering](../backend/app/domain/entitlements/metered.py) and its
[ledger bridge](../backend/app/domain/entitlements/ledger.py) still serve audit, Agent and
Site Health accounting. Reservation, release, debit and refund retain typed parent
identity, allocation order, fingerprints and dispatch provenance. An Agent run
holds one reservation per model step, so each debit carries that step's
dispatch key. Commit the
hold and attempt evidence before provider I/O; settle through the owning
transaction. Successful-answer charging and actual provider cost are distinct
quantities. Finite persisted rate/cap policy bounds funded work and unknown
usage. Customer BYOK consumes no platform credits and never silently falls back.
[Site Health fetch budget](../backend/app/domain/site_health/fetch_budget.py)
reserves a crawl's page budget at creation and settles analyzed pages on every
terminal path; accounts without a page-fetch grant are not metered there.
These Python metering, grant-write, resolver and admission bridges retire with
their audit, Site Health and Agent callers in migration PRs 17–19. Until then
Python is the only production ledger writer: the two stacks' request
fingerprints are not byte-compatible, so a subject's reservations, debits and
releases must stay with one stack. Each migration moves a caller's ledger
writes whole; it never retries a Python-written key from TypeScript. Operator
catalog publication, grant correction and plan verification remain Python-owned;
the read-only Razorpay plan reader has no checkout or settlement methods and
retires when that operator CLI migrates.

The shared transaction lock order remains in [architecture](architecture.md).
Never acquire project/domain locks after billing locks or hold a transaction
across network I/O.

## Read and UI surfaces

Public pricing reads the published catalog without a hardcoded fallback.
The app's `/billing` section
([billing screen](../frontend/components/billing/billing-screen.tsx) and the
other [billing components](../frontend/components/billing/)) shows account,
invoice, usage, intent and subscription state, and runs plan changes and
add-on/top-up purchases. Every purchase reviews the full server quote with
payment consent and the policy links before the provider opens. The checkout controller polls persisted
activation; only confirmed activation refreshes access caches. Unavailable
checkout is shown honestly. Pricing remains usable before project creation.
The prepared app `/pricing` continuation captures only a bounded catalog
selection from its URL before sign-in. The app stores its own pending intent;
after sign-in it resolves the selected workspace and fresh catalog, requires
billing permission and explicit confirmation, and uses the existing
workspace-scoped checkout controller. Every purchase (plan, add-on, top-up or
upgrade) shows the backend-resolved quote before the separate payment
confirmation. No purchase
starts from a GET, login or reload. The prepared marketing Worker renders the
validated public catalog in initial HTML and links bounded selections to app
`/pricing`. It sends no visitor credentials on the catalog read and performs no
billing mutation. The captured old apex runtime remains available for
first-cutover recovery.

The no-card introductory offer is separate from checkout: explicit consent,
once-per-account eligibility and idempotent activation are catalog-controlled.
Its seeded campaign is disabled/draft. Card-trial quote remains unavailable.
Provider keys are write-only; neither UI nor logs receive their plaintext.

## Acceptance limits

Razorpay activation follows its
[activation plan](plans/citeladder-razorpay-activation.md).
Provider selection, sandbox captures, recurring methods, tax parity and live
payment enablement are not established by local tests. The
[release checklist](release-checklist.md) retains external acceptance gates.
[Provider-boundary tests](../frontend/services/api/test/billing-boundaries.test.ts)
exercise provider/environment isolation and fail-closed behavior with doubles.
