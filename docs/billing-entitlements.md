# Billing and entitlements

## Responsibility

Billing owns workspace commercial accounts, published offers, purchase intent,
subscriptions, normalized payment/refund evidence and invoices. Entitlements
owns effective access, occupancy and consumable accounting. An intent, redirect
or provider authorization is not paid access. Payments remain disabled by
default; implemented adapters are not evidence of provider acceptance.

## Commercial authority and access

[Billing accounts](../backend/app/domain/billing/accounts.py) resolves the one
account for a workspace. Owner-user metadata is not a payer-selection rule.
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

The [resolver](../backend/app/domain/entitlements/resolver.py) chooses the active
primary profile, falling back to the free baseline, then applies deliberate
supplements. Grants/revocations remain append-only. Occupancy admission uses
locked current counts; reads expose persisted/current projections without
repairing provisioning or acquiring admission locks. Missing authority is not
unlimited access.

## Explicit purchase to settlement

[Checkout API](../backend/app/api/billing_checkout.py),
[checkout](../backend/app/domain/billing/checkout.py) and
[idempotency](../backend/app/domain/billing/idempotency.py) validate the selected
offer and billing details and commit pending intent before provider I/O.
Intent freezes the originating provider and environment. Changing the default
must not reroute an old record or retry an uncertain creation through a different
provider.

[Webhooks](../backend/app/domain/billing/webhooks.py) and bounded
[reconciliation](../backend/app/domain/billing/reconciliation.py) converge on
[activation](../backend/app/domain/billing/activations.py). Authenticated
payment/subscription evidence, period identity and stable grant keys make
settlement idempotent. Duplicate event IDs with conflicting digests quarantine.
Normalized refunds cannot exceed payment value. Redirects grant nothing.
[Invoices](../backend/app/domain/billing/invoices.py) issue one receipt per
captured payment and one credit note per processed refund, each series
consecutive per financial year. A full refund revokes the purchase's remaining
grants; consumed units are not clawed back. Refunds arrive as provider refund
events and settle against the original payment receipt.

Base plans are recurring provider subscriptions. Add-ons, top-ups and an
upgrade's prorated charge are one-time provider orders: the intent persists the
order, and the single captured payment on it settles the purchase, so both
order-paid and payment-captured deliveries converge on one activation. An
unpaid checkout is abandoned after the reconciliation window instead of holding
the one-pending slot; for a base-plan intent the provider subscription is
cancelled first, and a failed cancellation keeps the intent pending for retry.
[Plan changes](../backend/app/domain/billing/plan_changes.py) edit the one base
subscription: an upgrade charges the prorated base-price difference for the rest
of the paid period and, once paid, issues the higher plan's bundle for that
remainder; a downgrade waits for renewal with no refund. Either way the
subscription holds at most one scheduled change carrying the target plan's
frozen terms, which the renewal billed on the target provider plan swaps in.
Existing subscribers stay on the provider plan and terms they authorised;
each catalog revision names one immutable provider plan per SKU and region.

The provider registry fails closed for unknown or unconfigured adapters.
Checkout initialization (one route for every activation kind) exposes only safe
public identity. Callback verification binds its signature to the stored
subscription or order and schedules bounded reconciliation; durable webhook receipt precedes asynchronous processing. The
checkout kill switch does not disable recovery of existing payment evidence.
Razorpay vocabulary, headers, keys and webhook path remain adapter-owned.
[Provider readiness](billing-provider-readiness.md) owns selection and acceptance
conditions; [operator procedures](operations/billing-operator-guide.md) own
explicit-target, reasoned, dry-run-reviewed administrative operations.

## Metered execution

[Metering](../backend/app/domain/entitlements/metered.py) and the
[ledger](../backend/app/domain/entitlements/ledger.py) share audit, Content and
Agent accounting. Reservation, release, debit and refund retain typed parent
identity, allocation order, fingerprints and dispatch provenance. Commit the
hold and attempt evidence before provider I/O; settle through the owning
transaction. Successful-answer charging and actual provider cost are distinct
quantities. Finite persisted rate/cap policy bounds funded work and unknown
usage. Customer BYOK consumes no platform credits and never silently falls back.
[Site Health fetch budget](../backend/app/domain/site_health/fetch_budget.py)
reserves a crawl's page budget at creation and settles analyzed pages on every
terminal path; accounts without a page-fetch grant are not metered there.

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
[Provider-boundary tests](../backend/tests/component/test_provider_boundary.py)
exercise provider/environment isolation and fail-closed behavior with doubles.
