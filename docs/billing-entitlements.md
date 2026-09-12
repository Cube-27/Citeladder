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
retires the former published revision. Subscriptions and periods freeze catalog
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

The provider registry fails closed for unknown or unconfigured adapters.
Subscription checkout initialization exposes only safe public identity. Callback
verification binds its signature to the stored subscription and schedules bounded
reconciliation; durable webhook receipt precedes asynchronous processing. The
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

The shared transaction lock order remains in [architecture](architecture.md).
Never acquire project/domain locks after billing locks or hold a transaction
across network I/O.

## Read and UI surfaces

Public pricing reads the published catalog without a hardcoded fallback.
[Billing settings](../frontend/components/settings/billing-settings.tsx) and
[billing components](../frontend/components/billing/) show account, invoice,
usage, intent and subscription state. The checkout controller polls persisted
activation; only confirmed activation refreshes access caches. Unavailable
checkout is shown honestly. Pricing remains usable before project creation.

The no-card introductory offer is separate from checkout: explicit consent,
once-per-account eligibility and idempotent activation are catalog-controlled.
Its seeded campaign is disabled/draft. Card-trial quote remains unavailable.
Provider keys are write-only; neither UI nor logs receive their plaintext.

## Acceptance limits

Razorpay work is pending, with execution still subject to its
[retained plan](plans/citeladder-razorpay-local-test-integration.md).
Provider selection, sandbox captures, recurring methods, tax parity and live
payment enablement are not established by local tests. The
[release checklist](release-checklist.md) retains external acceptance gates.
[Provider-boundary tests](../backend/tests/component/test_provider_boundary.py)
exercise provider/environment isolation and fail-closed behavior with doubles.
