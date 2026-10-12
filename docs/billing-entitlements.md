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
The [registry](../frontend/services/api/src/config/entitlements.json) (`entitlements-v1`)
holds what plans grant. Every paid plan bundle grants `workspace_access`,
`team_members`, `project_deletion`, `crawl_logs`, `api_access` with ten
`api_keys`, `commerce`, `search_intelligence`, its occupancy counters,
`prompt_runs_per_period` and `ai_credits`; Growth and Scale add `agent` and
`market_slots`. Audit cadence, exports and fan-out are not gated
([B5](billing-decisions.md)). Flags are checked without the capacity lock:
[crawl logs](ai-traffic.md) refuse with 409 `crawl_logs_not_in_plan`, the
[public API](public-api.md) with 403 `api_access_not_in_plan`, and Commerce and
Search Intelligence work (Commerce writes and Commerce-scope audits; Search
Intelligence reviews, confirmations and citation matching) with 403
`capability_not_granted`. Data already collected stays readable after a
downgrade. The non-public flag `fact_checking` is in no bundle; operators grant
it per pilot workspace with `billing:admin grant`, and
[fact-checking](visibility-prompt.md#fact-checking-pilot) refuses without it (409
`fact_checking_not_in_plan`).
Occupancy fails closed: an account with no grant for projects, prompts, markets
or API keys has an allowance of zero. A project's default market is free; extra
markets admit under the capacity lock and refuse with 403
`occupancy_limit_exceeded`.
Prompt slots are checked when prompts are added; after a downgrade, the
workspace's prompts beyond `prompt_slots` (newest first out) are kept, read as
`over_plan_limit`, and excluded from audits until slots free up.

Public registration persists its origin on the identity and billing account and
issues `public-trial-v1` once, starting at the original registration cohort and
ending after `BILLING_TRIAL_DAYS` (release value 7). Login and operator repair
cannot add a permanent baseline to that account. Public provenance also consumes
eligibility for the separate no-card campaign. Existing non-public grants remain.
The trial allows one project, 20 prompts, 20 monitored URLs and ChatGPT only,
with 20 prompt runs and 5,000 AI credits for its whole length; the Agent and
top-ups remain unavailable.

`entitlements/access.ts` resolves `active`, `trial_active`, `trial_expired`,
`subscription_lapsed` and `access_unresolved` without writes. A workspace
whose paid plan access took effect and has since ended reads
`subscription_lapsed`, never `trial_expired`, so trial purge never selects a
former customer. Expiry is checked at dispatch and subsequent
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
grants; consumed units are not clawed back. A full refund of the payment for
the base subscription's current period also cancels that subscription at once
(B52): the period's plan grants, an upgrade's included, are revoked when the
refund settles, and the row reads `cancelled` but stays current, like a halted
one, until the subscription sweep's immediate provider cancellation is
confirmed. A partial refund changes nothing. Refunds arrive as provider refund
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
order-paid and payment-captured deliveries converge on one activation. A
declined attempt never fails an order, because the customer may retry on it. An
unpaid checkout is abandoned after the reconciliation window instead of holding
the one-pending slot; for a base-plan intent the provider subscription is
cancelled first, and a failed cancellation keeps the intent pending for retry.
A refused cancellation is followed by a fresh read, so a subscription the
customer paid meanwhile activates instead of being abandoned.
Orders cannot be cancelled at the provider, so a capture after abandonment still
settles (and a signed callback reopens the order for one probe, voiding any
in-flight probe's lease); an add-on or top-up paid outside the live base
period keeps its receipt, grants nothing and is logged for an operator refund. A halted subscription (provider retries
exhausted) stays current, blocking a second base plan, until the subscription
sweep has cancelled it at the provider; a subscription that resumes first is
left renewing. A definite provider refusal of a cancellation is final and the
sweep applies the provider's state; a fully refunded capture remains evidence
of its paid period, and the refund settles separately. An authorization that
lapsed uncaptured and was auto-refunded is not a payment.
A customer's cancellation is held in CiteLadder
([cancellation](../frontend/services/api/src/billing/cancellation.ts)) and sent to
the provider only `BILLING_CANCELLATION_SEND_LEAD_SECONDS` before renewal, because
the provider cannot undo one it has received; until then the customer may
resume. The subscription sweep commits the send before the provider call and
retries it while the provider still shows the plan renewing; provider evidence
of a cancellation also ends the resume window.
[Plan changes](../frontend/services/api/src/billing/plan-changes.ts) edit the one base
subscription: an upgrade charges the prorated base-price difference for the rest
of the paid period and, once paid, issues the higher plan's bundle for that
remainder; a downgrade waits for renewal with no refund, and the checkout kill
switch does not block it because it charges nothing. Either way the
subscription holds at most one scheduled change carrying the target plan's
frozen terms, which the renewal billed on the target provider plan swaps in.
Existing subscribers stay on the provider plan and terms they authorised;
each catalog revision names one immutable provider plan per SKU and region.

The [Razorpay REST client](../frontend/services/api/src/billing/razorpay.ts)
fails closed for unknown or unconfigured providers and fixes the credentialed
origin, disables redirects and bounds timeouts and collection pagination.
Recovery finds a crashed checkout's provider record by its own keys (an order by
receipt, a subscription by plan within its creation window), never by listing
the account. Payment events with neither an order nor an invoice (payment links,
QR codes) are acknowledged and ignored.
Checkout initialization (one route for every activation kind) exposes only safe
public identity. Callback verification binds its signature to the stored
subscription or order and schedules bounded reconciliation, even after the
quote expired; durable webhook receipt precedes asynchronous processing. The
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
billing boundary. Reservation, release, debit and refund retain typed subject
identity (audit task, Agent run, Site Health crawl or platform call),
allocation order, fingerprints and dispatch provenance. Every hold commits
before provider I/O and settles once through its owner.

**Prompt runs.** Each engine or search-surface answer is one run of the plan's
`prompt_runs_per_period`, whichever key pays: every audit task holds one run at
admission (manual, scheduled, MCP, public API and repair alike), only a recorded
answer spends it, and every other terminal path releases it
([prompt runs](../frontend/services/api/src/audits/prompt-runs.ts)). Answer
analysis is included in the run. An exhausted allowance refuses the launch with
403 `prompt_runs_exhausted`.

**AI credits.** Every platform model call spends AI credits through the
[metering owner](../frontend/services/api/src/billing/metering.ts): prompt
generation, onboarding research and brand discovery, Commerce buyer prompts and
the Agent. A call holds its maximum cost (every input byte plus the output cap)
at the serving model's [token price](../frontend/services/api/src/config/ai-credits.json)
with the markup, in whole credits rounded up, then settles once to the reported
tokens. Unreadable usage settles at a fixed fallback no larger than the hold; a
failed call that reports no usage is not charged; a hold a crash left open
settles at the fallback in the billing lane. A model with no configured price is
refused, except the platform gateway model, priced at the default rate. Answer
perception, fact verification and the Commerce shelf are recorded as included in
the run; the JEV judge, Tavily and Keenable are recorded and not charged. Every
call is recorded in `platform_calls`. The gateway, JEV, Tavily and Keenable
clients refuse a call made outside a metering scope, so a new feature cannot
reach a paid provider unmetered. Customers see only credits; the prices, markup
and the credit's money value stay internal. The Agent holds and settles each
model step through its own dispatch records with the same pricing and ledger,
and always uses the platform gateway.

**Managed plans.** A workspace on a live managed plan measures every engine,
DataForSEO surfaces included, on the platform's keys; the request never chooses
the mode. Its monthly platform budget admits a launch while the month's recorded
spend is below the ceiling (`BILLING_FUNDED_MONTHLY_BUDGET_MINOR`).
Search Intelligence on a managed plan researches on the platform's DataForSEO
account and spends AI credits: the review prices the estimate in credits (the
DataForSEO cost converted exactly as token cost is), confirmation holds it in the
same transaction, and the ended analysis is charged the cost of the requests
sent, never above the hold ([charges](../frontend/services/api/src/search-intelligence/charges.ts)).
A BYOK workspace researches on its own key and is not charged.
[Site Health fetch budget](../frontend/services/api/src/site-health/fetch-budget.ts)
reserves a crawl's page budget at creation and settles analyzed pages on every
terminal path; accounts without a page-fetch grant are not metered there. Audit
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

Checkout opens per workspace before it opens to everyone
([checkout access](../frontend/services/api/src/billing/checkout-access.ts)):
`BILLING_CHECKOUT_AUDIENCE=allow_list` (the default) sells only to workspaces
holding the non-public `billing_checkout` grant, issued with `billing:admin
grant`; `everyone` opens it to all. Razorpay test keys work in production, but
a test-mode checkout there serves allow-listed workspaces only. The public
catalog never reads a workspace, so it shows checkout unavailable until the
audience is everyone; the app reads `/billing/workspace-catalog`, which applies
the same rules to the active workspace, so in-app billing and marketing agree.
While no self-serve plan is open, in-app billing lists no prices either.
The app's `/billing` section
([billing screen](../frontend/components/billing/billing-screen.tsx) and the
other [billing components](../frontend/components/billing/)) shows account,
invoice, usage, intent and subscription state, and runs plan changes and
add-on/top-up purchases. Every purchase reviews the full server quote with
payment consent and the policy links before the provider opens. The checkout controller polls persisted
activation; only confirmed activation refreshes access caches. Unavailable
checkout is shown honestly. Pricing remains usable before project creation.
In-app plan choice offers your own keys or managed. A workspace whose trial or
plan ended keeps exactly the path to buying a plan (the workspace catalog, its
billing state, a new subscription and its checkout and verification), and the
ended-access screen offers the plans to an Owner or Admin; add-ons, top-ups,
plan changes, usage and invoices stay behind access. Limit refusals say what the
plan includes and link to billing.
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
Its seeded campaign is disabled/draft.
Provider keys are write-only; neither UI nor logs receive their plaintext. A
managed workspace has no provider settings, and its runs offer every engine.

## Acceptance limits

Razorpay activation follows its
[payment acceptance backlog](plans/backlog.md#acceptance-calibration-and-rollout).
Provider selection, sandbox captures, recurring methods, tax parity and live
payment enablement are not established by local tests. The
[release checklist](release-checklist.md) retains external acceptance gates.
[Provider-boundary tests](../frontend/services/api/test/billing-boundaries.test.ts)
exercise provider/environment isolation and fail-closed behavior with doubles.
