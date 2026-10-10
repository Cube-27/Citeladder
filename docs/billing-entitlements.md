# Billing and entitlements

## Responsibility

Billing owns workspace commercial accounts, published offers, purchase intent,
subscriptions, normalized payment/refund evidence and invoices. Entitlements
owns effective access, occupancy and consumable accounting. An intent, redirect
or provider authorization is not paid access. Payments remain disabled by
default; implemented adapters are not evidence of provider acceptance.

## Commercial authority and access

[Workspace billing lookup](../frontend/services/api/src/billing/purchases.ts) resolves
the one persisted account for a workspace. TypeScript
[account provisioning](../frontend/services/api/src/entitlements/bootstrap.ts)
owns runtime workspace bootstrap. Native operators, login, seed tooling and
[deployment bootstrap](../frontend/services/api/src/auth/deployment-bootstrap.ts)
use the same account/grant owners. The [schema baseline](../frontend/services/api/migrations/0001_baseline.sql) holds table
declarations and column defaults; native config owns application policy.
Owner-user metadata is not a payer-selection rule.
[Workspace roles](workspace-access.md) gate billing and credentials to
Owner/Admin; product Members receive safe effective allowances rather than
private billing records.

[Native catalog reads](../frontend/services/api/src/billing/catalog.ts) resolve
persisted commercial authority. Native [catalog administration](../frontend/services/api/src/billing/admin.ts)
validates and publishes revisions. Validated revisions are immutable, and publication
retires the former published revision. [Launch catalog](../frontend/services/api/src/billing/catalog-authoring.ts)
authors `launch-pricing-v1`; regional amounts are frozen at authoring by the
[currency rule](../frontend/services/api/src/config/billing-authoring.ts) and never
converted at runtime. India is charged in INR plus GST; every other country in
USD. Add-ons and top-ups are one-time catalog items: their grants last
`expiry_days` after purchase or until the base subscription ends, whichever is
earlier, and require an eligible live plan. Subscriptions and periods freeze catalog
identity, credential mode, price, quantity and terms. Corrections use reviewed
forward-publication, never rewriting historical terms.

The [TypeScript resolver](../frontend/services/api/src/entitlements/resolve.ts) chooses the active
primary profile, retaining eligible non-public free baselines, then applies deliberate
supplements. Grants/revocations remain append-only. Occupancy admission uses
locked current counts; reads expose persisted/current projections without
repairing provisioning or acquiring admission locks. Missing authority is not
unlimited access. The TypeScript prompt writers resolve the same grants and
admit prompt slots in [`src/entitlements/`](../frontend/services/api/src/entitlements/),
under the [account capacity lock](../frontend/services/api/src/entitlements/occupancy.ts)
(a personalized BLAKE2b of `OCCUPANCY_LOCK_NAMESPACE` and the account id).
Commerce, project and prompt writers serialize on that same TypeScript boundary.
Registry `entitlements-v5` adds the public flag `crawl_logs` ("AI crawler
logs"), granted by every launch plan bundle and absent from the public trial.
[Crawl-log](ai-traffic.md) admission checks it without the capacity lock and
refuses with 409 `crawl_logs_not_in_plan`; reads stay available.
Registry `entitlements-v6` adds the public flag `api_access` and the occupancy
counter `api_keys` (live API keys), both granted by every launch plan bundle
(`api_keys` = 10) and absent from the public trial. Key creation admits under
the capacity lock; [public API](public-api.md) requests check the flag without
it and refuse with 403 `api_access_not_in_plan`.
Registry `entitlements-v7` adds the non-public flag `fact_checking`, in no plan
bundle and absent from the public trial. Operators grant it per pilot workspace
with `billing:admin grant`; [fact-checking](visibility-prompt.md#fact-checking-pilot)
and brand-fact writes check it without the capacity lock (409
`fact_checking_not_in_plan`), and its reads report `not_enabled`.
Registry `entitlements-v8` adds the occupancy counter `market_slots`: a
workspace's additional measurement markets (a project's default market is
free). Growth grants 3 and Scale 10; Starter and the public trial have none, so
adding a market there is refused with 403 `occupancy_limit_exceeded`. Market
creation admits under the capacity lock.

Public registration persists its origin on the identity and billing account and
issues `public-trial-v1` once, starting at the original registration cohort and
ending after `BILLING_TRIAL_DAYS` (release value 7). Login and operator repair
cannot add a permanent baseline to that account. Public provenance also consumes
eligibility for the separate no-card campaign. Existing non-public grants remain.
The trial allows one project, 20 prompts, 20 monitored URLs and ChatGPT only;
Agent and AI credits remain unavailable. Its separate `successful_answers` ledger
reserves 20 lifetime answers, debits successful tasks once and releases terminal
failures. Immutable task snapshots retain the original prompt ID for the one-success
per-prompt limit, including audit repair. Attempt funding remains separately bounded.

`entitlements/access.ts` resolves `active`, `trial_active`, `trial_expired` and
`access_unresolved` without writes. Expiry is checked at dispatch and subsequent
network boundaries; already-dispatched evidence may settle. Capacity supplements
and credit top-ups do not reopen expired access. An explicit operator
`workspace_access=1` override can restore it through the existing
`billing:admin grant` command, with explicit workspace/account, active platform admin, reason,
idempotency key and dry-run before `--apply`. Additional capacity is a separate
deliberate grant; this operation never reissues a trial.

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
The [billing recovery lane](../frontend/services/api/src/billing/recovery.ts) claims each
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
billing boundary. [Agent funding](../frontend/services/api/src/agent/funding.ts)
and [AI credit rates](../frontend/services/api/src/billing/ai-credits.ts) use that
ledger for runtime accounting. Reservation, release, debit and refund retain typed parent
identity, allocation order, fingerprints and dispatch provenance. An Agent run
holds one reservation per model step, so each debit carries that step's
dispatch key. Commit the
hold and attempt evidence before provider I/O; settle through the owning
transaction. Successful-answer charging and actual provider cost are distinct
quantities. Finite persisted rate/cap policy bounds funded work and unknown
usage. Missing, malformed or inconsistent usage (including cached input exceeding
input) settles at the frozen policy's unknown-usage charge, bounded by the
admitted hold. It is not clamped into an exact observed token debit. Failed
dispatches also settle unknown usage exactly once. Customer BYOK consumes no
platform credits and never silently falls back.
[Site Health fetch budget](../frontend/services/api/src/site-health/fetch-budget.ts)
reserves a crawl's page budget at creation and settles analyzed pages on every
terminal path; accounts without a page-fetch grant are not metered there.
Audit reservations, debits and releases use the ledger owner. Audit
fingerprints hash compact JSON with sorted ASCII keys
([ledger](../frontend/services/api/src/entitlements/ledger.ts)), so a replay with
the same key and facts is idempotent. Entries persisted in an earlier format are
incompatible and fail closed on replay; they require fresh disposable pre-launch
data rather than rewriting immutable history. No reset is implicit.
Runtime metering, grants, resolution and admission use their owners.
Each subject has one ledger-writing stack. Operator
catalog publication, grant correction and read-only plan verification are native.
Catalog commands serialize publication and persist creation/publication request
keys on immutable revisions; grants/revocations use their existing evidence keys.
Preview executes the real mutation and rolls back its transaction.

Native [execution config](../frontend/services/api/src/config/billing.ts) owns
checkout, reconciliation, webhook settings and commercial runtime vocabularies.
Native authoring owns exact rational currency/GST rounding, seller configuration
and read-only Razorpay admission. Native config owns the entitlement registry.
Native provider display derives from the native catalog and frozen routes.

The shared transaction lock order remains in [architecture](architecture.md).
Never acquire project/domain locks after billing locks or hold a transaction
across network I/O.

The configured development operator (default `dev@citeladder.com`) receives all
issuable capabilities and highest feature levels through development bootstrap.
Its owned workspace also bypasses the Crawl Logs and advanced Site Health rollout
switches through `auth/development-access.ts`. This requires the configured
development password and active admin identity. It does not confer access to other
workspaces or replace provider credentials, payment consent or execution bounds.

## Read and UI surfaces

Public pricing reads the published catalog without a hardcoded fallback.
While all self-serve checkout is unavailable, the marketing pricing page shows
only its hero and coming-soon notice; paid plans, prices, comparisons, extras
and the closing pricing CTA are hidden. The notice links to registration when
public signup is open, otherwise to early-access contact. The catalog remains
the authority for pricing and availability when checkout opens.
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
validated public catalog in initial HTML (from a short-lived edge-cached copy)
and links bounded selections to app
`/pricing`. It sends no visitor credentials on the catalog read and performs no
billing mutation. The captured old apex runtime remains available for
first-cutover recovery.

The no-card introductory offer is separate from checkout: explicit consent,
once-per-account eligibility and idempotent activation are catalog-controlled.
Its seeded campaign is disabled/draft. Card-trial quote remains unavailable.
Provider keys are write-only; neither UI nor logs receive their plaintext.

## Acceptance limits

Razorpay activation follows its
[payment acceptance backlog](plans/backlog.md#acceptance-calibration-and-rollout).
Provider selection, sandbox captures, recurring methods, tax parity and live
payment enablement are not established by local tests. The
[release checklist](release-checklist.md) retains external acceptance gates.
[Provider-boundary tests](../frontend/services/api/test/billing-boundaries.test.ts)
exercise provider/environment isolation and fail-closed behavior with doubles.
