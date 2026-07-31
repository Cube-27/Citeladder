# v8 Pending Features

> Everything deliberately **deferred** out of the v8 delivery
> (`docs/plans/v8-cost-latency-and-tier-pricing.md`), in priority order, with the
> concrete dependency that unblocks each item. Nothing here was cut for scope
> alone — each item is blocked on a missing measurement, a missing external
> contract, or a missing owner. Deferring an item never weakens its
> requirements: the full specification is preserved so it can be lifted intact.

## Delivery context

| PR | Scope | Status |
|---|---|---|
| PR1 | Backend: cost + latency (T1–T6), BYOK/funded credentials (T11), entitlement core + commercial API (T7–T9), trial grant algebra only, enterprise (T16) | planned |
| PR2 | Frontend: pricing + landing (T13), in-app surfaces (T14), coming-soon providers (T15) | planned, depends on merged PR1 DTOs |
| **PR3** | **Everything in this document** | **not started** |

---

## 1. Prompt scheduling — timezone-aware audit schedules (T12)

**Highest priority.** Recurring scheduled audits are a required product feature,
not an enhancement. Deferred only because the periodic-runner story had no owner
at v8 planning time.

Full specification is preserved verbatim in
`/code/.plans/subplans/slice1-plan.md` under *DEFERRED TO PR3*, including the
`AuditSchedule` + `audit_schedule_occurrences` schema, the unique
`(schedule_id, local_date)` occurrence constraint, the DST policy (**gap**:
dispatch at the first existing instant after the missing local time; **fold**:
dispatch exactly once), the delayed-tick and concurrent-dispatcher cases, the
lead time derived from measured p95, and the partial-report policy.

- Must be a **bounded, idempotent one-shot dispatcher script** invoked by
  deployment cron (`backend/scripts/dispatch_due_audits.py`) — not a
  long-running scheduler service, and not an interval callback inside
  `audit_worker.py`, which would couple schedule correctness to worker uptime.
- `benchmark_cadence` already resolves as an entitlement key in PR1; PR3 adds
  the dispatcher that consumes it. PR1/PR2 must not imply scheduled runs happen
  (no "next run at", no schedule-management UI).
- The **T5 batch execution lane ships dormant in PR1** (flag-off, test-only, no
  deployment invocation) precisely because its only production consumer is this
  dispatcher. PR3 turns it on.

**Blocked on:** a deployment owner for cron invocation, cadence policy, and
single-run operational policy.

## 2. Periodic deployment invocations

PR1 ships each periodic job as a bounded idempotent script plus a testable
service function, but **no cron wiring**.

- `backend/scripts/reconcile_billing.py` — the reconciliation **service and CLI
  ship in PR1** and are manually runnable on day one, so a missed webhook never
  leaves a paying customer with no grants and no recovery path. Only the
  scheduled invocation is deferred.
- The trial reminder script arrives with item 3.
- `backend/scripts/dispatch_due_audits.py` arrives with item 1.

**Blocked on:** deployment owner, cadence, alert routing.

## 3. Trial checkout, activation and abuse controls (T10)

PR1 ships trial **grant mechanics** only: `source_kind=trial` is a first-class
`AccountGrant`, participates in the frozen spend ordering (trial first on exact
ties), expires on deadline or exhaustion, and is fully covered by resolver
tests. Operator, test and dev-seed paths may write trial grants.

Trial **checkout returns `trial_unavailable`**. Everything below is deferred
intact — §8.2's abuse requirements are **not relaxed**, only postponed. The full
specification is preserved in `/code/.plans/parts/slice23.md` under
*DEFERRED TO PR3*, and the trial-UI specification in
`/code/.plans/parts/frontend.md` under the same heading.

Four hard dependencies, none of which exist at HEAD:

| Dependency | What is needed | Why it cannot be faked |
|---|---|---|
| Payment-instrument identity | A documented, stable, opaque Razorpay instrument fingerprint (HMAC'd before persistence), plus the duplicate-instrument cancellation/refund policy | §8.2 requires one trial per instrument **across all accounts ever**. Last-four, card network and customer id are not stable identities, and raw card data must never be stored. |
| Verified email | Immutable verified-email state and flow (`User.email_verified_at`, signed expiring tokens, send/resend/confirm) — either built here or supplied by an auth workstream | HEAD has no verified state, and verification cannot be inferred from login or from an email merely being present. |
| Trusted IP + ASN | Edge-stripped client IP, a named ASN service, HMAC'd IP token + ASN retention policy, and a **review queue** rather than a hard block | Untrusted `X-Forwarded-For` is trivially spoofed, so using it would ship the control in name only. |
| Reminder delivery | A transactional email adapter with a named provider/template owner, for day-5 and day-6 reminders | Silently dropping reminders changes the product's promise. |

Also deferred with it: the immediate front-loaded pulse audit on trial start,
per-IP/per-ASN velocity limits, disposable-email blocking, and the review queue.

Note: the PR1 dev-login seed writes trial grants for **API and grant-algebra
testing only** — not to exercise trial UI, which PR2 does not build.

## 4. Coming-soon provider adapters (T15)

`provider.grok`, `provider.perplexity` and `provider.copilot` exist as catalog
flag keys and resolve through the grant algebra in PR1, and are surfaced in
marketing and in the UI with an explicit **coming-soon** label. None is ever
routed: `ACTIVE_TRANSPORTS` and `APPROVED_ROUTES` stay OpenAI/Anthropic/Google
only, and commercial activation returns `provider_unavailable` before any
provider I/O or grant issuance.

Delivery order: **Grok → Perplexity → Copilot**. Copilot is additionally
non-issuable (`issuable=False`) and is never written by any plan, operator, test
or dev-seed path.

> **Recorded deviation.** Keeping the Grok/Copilot logos and the six-provider
> accessible label is a deliberate, user-approved deviation from frozen §6.1 and
> the §12 gate *"no provider logo or capability claim without a shipped
> adapter"*, because these providers are committed for later integration. The
> gate is **not silently dropped**: the corresponding test changes from "logo
> absent" to "logo present, labelled coming-soon, and not connectable", and the
> accessible name distinguishes shipped from coming-soon providers so nothing
> implies six working integrations.

**Blocked on:** verified official API contracts and live-key conformance tests
per provider (exact model, endpoint, citations, usage, truncation, 429, and
empty-search behaviour), which §6 requires before either provider can be sold.

## 5. Funded catalog completion

PR1 ships the funded machinery — admission control, the consumable ledger,
per-task reservations, budget ceilings — but the funded **prices** are
deliberately unset, so funded checkout and top-up packs are unavailable and
`credit_price` is `null`.

Consequently PR2's pricing page defaults to the **available BYOK `base_price`**
and renders funded mode as explicitly not-yet-priced. Frozen §7.1's
"default OFF shows funded, BYOK animates downward" behaviour is deferred with
this item. A null `credit_price` must never be coerced to zero or used to
fabricate a funded total.

**Blocked on** these config-owned values, all of which §13 leaves genuinely
open and which are set **without any code change**:

- funded margin multiplier
- top-up pack sizes
- included benchmark credits per tier
- repetitions per benchmark
- OpenAI and Google expected costs (require the T1 harness against live keys)
- every applicable per-search fee (a route **fails closed** on the funded path
  until its fee is configured)
- prompt count per audit (funded and trial admission fail closed until set)

## 6. Measured execution policy

The T1 measurement harness ships in PR1 as a committed, runnable script with a
recorded-fixture test path, but is **not run against live providers** — no
provider keys were available, and no measured number is ever fabricated.

Two consequences to close later:

1. **`pulse_answer_instruction` ships as an explicitly-labelled unmeasured
   candidate**, hashed so it cannot drift silently. The §2.1/§11 figures
   (−56% cost, −49% latency) **must not be attributed to it** in code,
   docstrings, tests or user-facing copy until the harness has run. The T6 gate
   matrix records the "measured instruction" gate as deferred.
2. The §3.7/§12 exit gates that require live measurement — the OpenAI and Google
   cost legs, per-search fees, per-route p95 tail timeouts, and the output-length
   distribution — remain **deferred with a written record** rather than marked
   passed.

`ttft_ms` also stays `null` until real streaming timestamps exist; a known
search count of zero never establishes a provider's per-search fee.

**Blocked on:** live provider keys for OpenAI and Google (and xAI/Perplexity for
item 4).

---

## Operational notes carried into PR3

- **Operator alerts** are named structured telemetry events with no secrets in
  the payload (unresolved entitlement, funded-budget exhaustion, credit
  exhaustion, duplicate-grant-prevented). Alert **rules** live in deployment
  config outside this repo and need an owner.
- **The dev-only login** shipped in PR1 sits behind a single config flag that is
  **off by default** and **hard-fails startup outside a development or test
  environment**. It uses normal workspace membership, never bypasses
  `require_workspace_member`, never exposes platform-funded credentials, and
  never appears in any response DTO. There is no dev-login affordance anywhere in
  the frontend.
