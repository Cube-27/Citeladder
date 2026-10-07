# CiteLadder MCP Events plan

> Archived on 7 October 2026. Retained as historical scope and evidence, not
> execution authority or a current status report. Remaining work is consolidated
> in [the backlog](../plans/backlog.md), queued through [plan status](../plans/ACTIVE.md).

Status: proposed, retained follow-up; implementation is not assigned.
Prepared: 5 October 2026. Extracted from the
ChatGPT plugin plan, whose release does not depend
on this work. Assign this plan separately after the read-only plugin experience
is proven. No deployment, subscriptions or outbound deliveries are authorized
by retaining this document.

## Outcome and ownership

Let a user request monitoring of measured AI Visibility changes and receive an
analysis in ChatGPT when their criteria match. CiteLadder's existing Visibility
owner determines measurement facts; the subscription records the user's
interest; ChatGPT determines its response from the user's instructions.

The first proposed event is `visibility.measurement_changed`. Do not introduce
a universal "10% drop means alert" rule or the full suggested nine-event catalog.
Production subscriptions concern authorized project measurements only.

Current [MCP](../mcp.md) owns OAuth records and read delivery. Events add durable
subscription and delivery state under that owner, using the existing PostgreSQL
worker architecture. Settle this cross-feature decision before implementation
and update [architecture](../architecture.md) and MCP documentation when the
boundary is accepted. Follow [invariants](../invariants.md),
[workspace access](../workspace-access.md) and
[Visibility semantics](../visibility-prompt.md); no second metric store,
acquisition scheduler or unbounded automation loop is introduced.

## Platform contract

The checked [OpenAI Events documentation](https://developers.openai.com/plugins/build/mcp-events)
requires MCP `2026-07-28`, authenticated discovery/subscribe/unsubscribe methods,
persistent subscriptions and verified webhook delivery. Supported surfaces are
Work web, Work desktop with Cloud selected, and dots; workspace controls apply.
Polling and streaming delivery are not supported. Recheck availability and the
wire schemas before implementation; current protocol support alone does not
implement Events.

Callbacks require HTTPS, verification and signed requests. Validate resolved
addresses when connecting, refuse non-public addresses and redirects, and
encrypt signing secrets. Persist expiration, stable event IDs across retries
and idempotent subscription identity. Implement these from the current protocol,
not from the illustrative application payload below.

## Proposed measurement contract

The event describes a compatible pair of persisted measurements independently
of any subscriber threshold. The following are application fields inside the
protocol event's `data`, not a replacement protocol envelope:

| Field | Meaning |
| --- | --- |
| `project_id` | Authorized UUID; workspace scope is resolved server-side |
| `metric`, `unit` | Canonical metric identifier and explicit scale/unit |
| `engine`, `cohort`, scope identity | Frozen comparison dimensions, including model/retrieval and prompt scope where relevant |
| `previous_measurement_id`, `current_measurement_id` | Exact source measurements; neither silently resolves to Latest |
| `previous_value`, `current_value` | Domain-owned measured values, with coverage/denominator references |
| `absolute_delta` | Current minus previous, in the named metric's unit |
| `relative_delta` | Signed `(current - previous) / previous` for an eligible positive baseline |
| `relative_delta_state` | Available or an explicit reason such as zero baseline; undefined is never zero |
| Evidence and version references | Sources and relevant processing/comparison versions needed to inspect the result |

Use the existing domain comparison eligibility contract before generating this
event. Incompatible, unavailable or insufficiently covered measurements do not
become change events. A compatible zero-baseline pair may carry an absolute
delta, but cannot match a relative-change filter. Fix source identity and
ordering so retries and late-arriving results cannot silently select a different
baseline. Proposed default baseline: the immediately preceding eligible
measurement under the same frozen scope. Confirm that choice before coding.

For a rate stored as a fraction, a move from 0.50 to 0.40 is `absolute_delta`
-0.10 (displayed as -10 percentage points) and `relative_delta` -0.20 (a 20%
decrease). The model and UI never recompute canonical values.

## Subscription criteria

The proposed subscription arguments include project, metric, scope,
`direction` (increase/decrease/either), a nonnegative relative-change magnitude
or an absolute-change threshold with units, and an explicit comparison operator.
For "drops more than 10%", use decrease, magnitude 0.10 and strict greater-than;
for "at least 10%", use greater-than-or-equal. Match against the signed domain
delta using the direction and magnitude. Reject ambiguous units or ask for
clarification before registering. Do not silently combine two threshold modes.

Thresholds express subscriber interest and are evaluated deterministically on
the server. Config-owned minimum evidence requirements, allowed metrics,
subscription counts, cooldowns, payload sizes and delivery budgets still apply.
The user cannot lower measurement-validity requirements through a filter.
Canonicalize filter arguments for idempotency. Keep the measurement event
identity independent of thresholds; deduplicate delivery per subscription/event.

Before implementation, decide baseline policy, default expiry, replay behavior,
delivery retention, retry/cooldown bounds, entitlements and notification volume.
These are open decisions, not values inferred from a user saying "10%".

## Delivery and authorization design

1. Produce a durable event/delivery intent when the owning measurement commit
   completes, or through a bounded idempotent reconciliation owner. Never
   compare, score, acquire data or enqueue delivery on a read path.
2. Store subscriptions and delivery state in PostgreSQL. Use existing worker
   lease patterns, bounded retries and commit-before-network-I/O. Duplicate
   producer commits and worker recovery must preserve event identity.
3. Bind each subscription to its grant and authorized project, not a rotating
   access-token string. Recheck active membership, selected-workspace consent,
   grant revocation, subscription expiry and entitlement before delivery.
   Explicitly define grant lifetime versus access-token expiry for scheduled
   delivery; token refresh must not create a new subscription identity.
4. Deactivate queued eligibility on unsubscribe, disconnection or workspace
   removal. Fence concurrent dispatch claims and recheck before outbound I/O;
   document the in-flight boundary because transmitted data cannot be recalled.
5. Send minimal measured-change data and evidence IDs, never raw private answers,
   credentials or instructions to execute actions. User-requested monitoring
   authorizes that flow only, not publishing, crawling or another mutation.

Resolve callback verification with durable pending/active states and bounded
expiry; verification network I/O must not hold an open database transaction.
Auth checks apply to discovery and subscription lifecycle as well as reads.
Duplicate deliveries remain possible across network failures; promise stable
IDs and idempotent local handling, not exactly-once external processing.

## Implementation slices and acceptance

| Slice | Work and exit condition |
| --- | --- |
| E1 Measurement semantics | Finalize schema, eligible pairs, signed units and threshold operators under Visibility. Fixtures prove comparable changes, exact boundaries, zero baseline and unavailable states without model arithmetic |
| E2 Subscription lifecycle | Implement protocol discovery, scoped subscribe/refresh/unsubscribe and pending callback verification. Prove authorization, canonical identity, expiry and secret custody |
| E3 Durable delivery | Integrate committed measurement intent with the existing PostgreSQL worker. Prove concurrent claims, stable IDs, retries, revocation fences and restart recovery |
| E4 Host acceptance and rollout | On an explicitly authorized test setup, prove subscribe → matching event → analysis → unsubscribe, plus nonmatching filters. Reconfirm supported surfaces and absence of feedback loops |

Schema changes stay in `migrations/versions/0001_initial.py` with the existing
schema metadata owner and generated TypeScript types. Verify migrations only
on disposable data; this plan does not authorize resetting any database.

Use real PostgreSQL tests for duplicate producer commits, concurrent refresh,
expiry, unsubscribe/revocation races and restart/retry. Mock outbound HTTP for
verification, signing, destination validation, redirects, timeouts and duplicate
delivery. Use the smallest affected native suites with isolated credentials,
one reusable Git-directory log and no overlapping checks, per
[development](../DEVELOPMENT.md#api-service-typescript). Run
`./scripts/check.ps1 -CheckOnly` once when the executable persistence/protocol
diff is complete; CI owns full suites and builds. Review with
[Review.md](../../Review.md). Local mocks do not prove ChatGPT acceptance.

Roll out behind independent config-owned subscription-admission and dispatch
controls. Start with founder-owned evidence and one event type. Rollback stops
new subscriptions and delivery while retaining audit evidence and functional
unsubscribe. Record operational delivery failures without secrets or raw
evidence. Broader event types require their domain owners and separate scope.
