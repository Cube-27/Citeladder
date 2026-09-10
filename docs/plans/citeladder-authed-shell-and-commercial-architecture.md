# Account management and billing: one authenticated shell, agency workspaces, and a portable commercial core

> **Status:** proposed, three phases, in order. Written 2026-09-10 after a
> customer (`arpan@cube27.com`) lost their first project to a provider-boundary
> race.
>
> This is the guiding document for account management and billing. Phase 1 is
> ready to implement. Phase 2 is a design to build. Phase 3 is explicitly
> **no implementation** — it de-hardcodes provider decisions and records the
> migration process so that a later agent inherits the decisions rather than
> re-making them.
>
> This plan authorizes no deployment, no live checkout, no provider mutation,
> and no database reset. It supersedes nothing in
> [the Razorpay local test integration plan](citeladder-razorpay-local-test-integration.md);
> Phase 3 here is the portability work that plan's section 2D gestured at, and
> it inherits that plan's outstanding items rather than restating them.

## 0. The incident this starts from

A customer completed onboarding, watched the address bar show
`/projects?project=<uuid>` flick to `/projects`, and was told they were **not
allowed to create more projects**. On refresh the project was there.

The flicker was the visible edge of a hand-off. `/onboarding` lives in
`app/(onboarding)` and `/projects` in `app/(app)`; each layout mounts its own
`ProjectProvider`, so the selection onboarding made died with its provider. The
`?project=` parameter carried it across, and `ProjectsScreen` scrubbed it once
applied.

The hand-off could not close the window it was built for. It ran one effect tick
*after* the new provider had already resolved a project — and when that
provider's list was the pre-create one, "resolved" meant either `projects[0]`
(which the promotion effect wrote back to storage, making the wrong selection
permanent) or, for a first-ever project, an empty list that `OnboardingGate` read
as "this account has no projects". The gate redirected to a blank `/onboarding`;
the customer filled it in again; the second completion reached `create_project`
→ `enforce_occupancy` with `FREE_PROJECT_SLOTS = 1` already consumed, and was
refused.

An interim fix has shipped: the provider seeds its pin from storage, stamped with
the list generation it mounted against, and the gate treats an unconfirmed
selection as a third loading state. That closes the incident. It is still a
hand-off — storage instead of the URL — and a hand-off is a thing that can be
raced. Under a slow connection the same shape reads as a bug to the next
customer.

**Two independent mistakes are visible here**, and the phases separate them:

1. Two providers for one session, so state had to travel between them.
2. The active project was never durable state anywhere. It lived in a
   component's memory, was mirrored to storage, and was deliberately erased from
   the one place a user can see, bookmark and share.

Phase 1 fixes both.

## Phase 1 — One authenticated shell, with the project id in the URL

### 1.1 Collapse the provider boundary

Introduce `app/(authed)/layout.tsx` and nest the existing groups inside it. Next
route groups contribute layouts without contributing URL segments, and they
nest, so `app/(authed)/(app)/projects/page.tsx` still serves `/projects`. No
route changes, no redirects, no external URL churn.

```
app/(authed)/layout.tsx          ← SessionGuard + ProjectProvider + EntitlementProvider
app/(authed)/(app)/layout.tsx    ← Suspense + ProductTour + Toast + OnboardingGate + AppShell
app/(authed)/(app)/…             ← the 14 existing route directories, unchanged
app/(authed)/(onboarding)/onboarding/…
```

| Layer | Owns |
|---|---|
| `(authed)` | The session, the project list and active-project selection, the entitlement read — everything an authenticated request needs to be correctly scoped. |
| `(app)` | The workspace chrome and the first-run gate. |
| `(onboarding)` | A task column with no chrome. |

`ProjectProvider` sits above both because the `X-Workspace-Id` header it installs
is a property of the session, not of which chrome is drawn. `EntitlementProvider`
joins it: onboarding already reads entitlements to decide whether an additional
project is allowed, so hoisting resolves the allowance once per session instead
of re-fetching on every crossing.

### 1.2 The project id becomes durable URL state

The `?project=` parameter was not the mistake — **scrubbing it was**. Peer tools
keep it (Peec: `app.peec.ai/insights?brand=kw_…&resolution=day`), and they are
right to. Make it real state rather than a transient hand-off:

- **Precedence for the active project:** URL parameter → stored last-used id →
  first project. The URL is an explicit request and always wins.
- **The provider reads it,** not `ProjectsScreen`. Reading it in the provider
  means it is available on the *first render*, synchronously, before any effect —
  which is what removes the race rather than narrowing it. There is no window in
  which the provider can resolve to a different project, so nothing needs pinning
  and nothing needs handing off.
- **Selecting a project writes it,** preserving other parameters, so the switcher
  updates the address bar the way a filter does.
- **Nothing ever removes it.**
- **`localStorage` keeps one job:** what this browser had selected last time, used
  only when the URL names no project. It stops being a message between
  components.

What this buys beyond the bug fix, and why it matters more in Phase 2: a link to
a project is a link to *that project*. Back and forward work. Two tabs can hold
two different projects without fighting over one storage key. An agency can send
a teammate a URL instead of "switch to the Acme project first". That last one is
the reason to do it now rather than later.

**A URL naming a project that does not exist, or that this user cannot see, is
an explicit error state** — "project not found, or you don't have access" — never
a silent fall back to `projects[0]`. Silently showing someone a different
project's data than the one they asked for is the failure mode worth spending a
state on.

### 1.3 What this deletes

- The strip effect in `components/projects/projects-screen.tsx` (already gone;
  it stays gone).
- The storage-seeded pin and the `asOf` list-generation bound in
  `lib/project/project-context.tsx`. With the URL authoritative at first render,
  the pin returns to its original and only job: holding an **in-session**
  selection ahead of the refetch that confirms it.
- `hasPendingSelection` from the context and `OnboardingGate` — **only if** 1.4
  confirms the gate no longer needs it. Verify rather than assume; if a slow
  refetch still leaves a window, keep it. It is honest about a real state.

### 1.4 The gate's contract, restated

`OnboardingGate` decides one thing: does this account have zero projects? It may
answer "yes" only from a **settled, successful, current** list. Loading, error,
and refetching-after-create are all "wait", never "onboard". State it in the
component and cover it with tests independent of how many providers exist — this
is the invariant the incident violated, and it must survive Phase 2 rewiring.

### 1.5 Risks and how they are checked

| Risk | Check |
|---|---|
| A route group move silently changes a URL | Enumerate every route before and after; assert the sets are equal (`find app -name page.tsx`, diffed). |
| `export const instant = true` stops applying | It lives in `(app)/layout.tsx` and moves with the file. Confirm the shell still renders immediately on navigation. |
| `error.tsx` / `not-found.tsx` change scope | They move with `(app)`. An error thrown inside `(app)` must still be caught there, not escape to the root. |
| `(auth)` and `(marketing)` regress | They stay outside `(authed)`. Marketing must still load with no session query beyond its own. |
| URL/state feedback loop | Selecting writes the URL, which the provider reads, which could re-trigger a write. Assert one history entry per selection and no repeated `replace`. |
| Stale references | Four known: `test/fixtures/visibility.tsx`, `test/fixtures/prompts.tsx`, the `app/(app)/` prefix in `scripts/check-design-system.mjs`, and a comment in `(onboarding)/layout.tsx`. Grep again after moving. |

### 1.6 Coverage, including the additional-project path

The `?new=1` flow — adding a project to an existing account — has been hard to
exercise because Google sign-in is rate-limited, so in practice it is only walked
on the dev account. **The owner has confirmed a seeded password account is
acceptable for local and CI verification**, which removes that constraint. After
1.1 the two flows are the same code path distinguished only by `isAdditional`,
and every interesting state sits below the OAuth boundary:

- **Provider and gate level** (no network, no OAuth): first project with a cold
  list; additional project with a warm list; a refetch returning without the new
  project; a URL naming a deleted project; a URL naming another workspace's
  project; a failed list request.
- **Flow level** (mocked API): complete onboarding as a first project and as an
  additional one, asserting the same post-condition — the committed project is
  active, the URL names it, and no second completion is ever sent.
- **Browser level** (seeded password account, no Google): both flows end to end,
  plus the transient-network case — the list delayed past the navigation —
  asserting the workspace waits rather than redirecting to onboarding.

Seed through the ordinary password path; do not add a test-only auth bypass.
Google's limits constrain how we sign in during testing. They must not constrain
what we can prove.

### 1.7 Completion criteria

- Route set identical before and after.
- No component outside `(authed)` reads or writes the active-project selection.
- The project id is visible in the URL on every project-scoped route and is never
  removed.
- An unknown or unauthorized project id renders an explicit error, not a
  substitution.
- The provider/gate tests fail against the pre-fix code and pass after.
- `lint`, `tsc --noEmit`, `oxfmt --check`, `check:policy`, `knip` and the full
  vitest suite green; Playwright green for both project-creation flows.

## Phase 2 — Workspace management for agencies

### 2.1 The honest baseline

Less exists than the model suggests:

- `Workspace` is a real tenancy boundary. Every project-owned resource is scoped
  by `workspace_id`, and `require_workspace_member` / `require_active_workspace`
  / `require_project_member` verify membership on every query, returning 404
  rather than distinguishing a missing workspace from a forbidden one.
- `WorkspaceMember` has a `role` column — and **the only value ever written is
  `"owner"`**. No code authorizes on role. There is no non-owner path.
- There are **no invitations**. Nothing in the backend mentions them.
- There is **no per-project access**. Membership is workspace-wide and total.
- `BillingAccount.owner_user_id` is `UNIQUE`: one billing account per *user*,
  with workspaces attached through `WorkspaceBillingLink`.

So the tenancy and authorization spine is sound, and everything an agency needs
sits on top of it, unbuilt.

### 2.2 The shape to build

The reference product's vocabulary is worth adopting because it matches the
tenancy we already have: a **company** owns projects, has **members** with a
company role and per-project access, and carries **billing**. Mapped onto
CiteLadder, `Workspace` *is* the company. Do not introduce a new container.

| Concept | Maps to | Work |
|---|---|---|
| Company | `Workspace` | Naming and a settings surface. No new entity. |
| Member | `WorkspaceMember` | Make `role` load-bearing; today it is decorative. |
| Per-project access | new | A member may be scoped to a subset of the workspace's projects. |
| Invitation | new | Email invitation, pending state, acceptance binding to a persisted user id. |
| Billing | `BillingAccount` | Ownership moves from user to workspace — see 2.3. |

**Roles.** Start with the fewest that carry real authorization difference, and
write down what each may do before implementing:

- **Owner** — billing, members, workspace deletion, everything below.
- **Admin** — members and projects, not billing.
- **Member** — the projects they are granted, no member or billing management.

Resist a fourth until a customer names it. Every role is a permission matrix that
must be enforced in every handler, and an unenforced role is worse than no role
because it reads as a guarantee.

**Enforcement rule.** Role and project-access checks belong beside the existing
membership check in `app/api/deps.py`, in `WorkspaceContext` — never re-derived
per handler. `WorkspaceContext` already carries the resolved `member`; extend it
to answer "may this member do this to this project" and make that the only place
the question is asked. A permission model with two enforcement sites has one
enforcement site and one bug.

**Invariant to preserve.** Invitations bind to a **persisted user id** on
acceptance, never to an email string used later as authority. This is the same
discipline that keeps operator access out of customer entitlement today
(`provision_development_access` is bound to a UUID, deliberately not an email
comparison) and it is the discipline invitations most commonly break.

### 2.3 The billing-ownership migration

`BillingAccount.owner_user_id UNIQUE` expresses "a person pays for their own
workspaces" exactly, and cannot express what Phase 2 is for: an agency paying for
work owned by several of its people, seat-based pricing where payer and users
differ, or billing surviving the departure of whoever signed up.

In the previous draft this was a hypothetical and the recommendation was a seam.
Phase 2 makes it real, so it becomes a migration — and it must happen **in**
Phase 2, before subscriptions carry customers and receipts reference accounts.

**Direction.** Billing attaches to the workspace, not the user. `BillingAccount`
keeps its identity, grants, `entitlement_lifecycle_version` and
`registration_cohort_at`; what changes is the ownership edge:
`owner_user_id UNIQUE` becomes a membership relation, with exactly one member
holding the owner role at any time.

**What must not change**, because it is already correct:

- Occupancy counts across **every** linked workspace
  (`_count_project_slots`, `_count_prompt_slots` join through
  `WorkspaceBillingLink`), so allowances cannot be escaped by making another
  workspace. Extending ownership must not narrow this to one workspace.
- `registration_cohort_at` stays frozen from `User.created_at` and is never moved
  by login repair, workspace creation, or ownership transfer — otherwise campaign
  eligibility becomes farmable.
- `ensure_user_billing` stays idempotent and self-healing on register, login,
  OAuth and workspace creation, so a partially-failed signup repairs itself on
  the next request.
- The `entitlement_lifecycle_version` bump stays a single account-level write
  under a row lock. Do not replace it with a `max()` across subscriptions or
  members.

**Sequencing within Phase 2.** Introduce a single resolver —
`billing_account_for(workspace)` — and route every caller through it *before*
changing the schema. With one call site, the ownership change is a change to one
function plus a data migration, and the blast radius is knowable. Doing it the
other way round means finding every `owner_user_id` read under time pressure.

Record the outcome as an ADR: what a billing account attaches to, who may hold
the owner role, what happens on transfer, and what happens to grants and
in-flight subscriptions when a workspace leaves an account.

### 2.4 Open design questions for Phase 2

These need answers before implementation, not during:

1. Can one billing account span multiple workspaces for a *customer* (an agency
   with a workspace per client), or is it one account per workspace? The schema
   supports the former today via `WorkspaceBillingLink`; the pricing model has to
   agree with the schema.
2. Are members billable seats, or is pricing purely by project/prompt occupancy?
   This decides whether member management writes to entitlement at all.
3. Does an invited member consume the inviter's allowance, or bring their own?
   The Razorpay plan's acceptance list already carries "an invited member
   receives only the correct workspace sponsor's access" as a requirement — that
   sentence is only testable once this is decided.
4. What happens to a member's project access when a project moves or is deleted?

## Phase 3 — Provider portability, without implementation

**No Razorpay implementation happens in this phase.** Access is not available.
The goal is that whenever a provider decision is made — Razorpay or a successor —
no agent has to re-derive it. This section is both the de-hardcoding work and the
migration runbook.

### 3.1 What is already right, and must be preserved

`app/connectors/billing/base.py` defines `BillingProvider` as a `Protocol` in
commercial vocabulary — `create_base_subscription`, `fetch_subscription`,
`cancel_subscription`, `fetch_payment`, `refund_payment` — taking only
server-resolved arguments, with provider-neutral DTOs carrying status, amount,
currency, period bounds and update version. A browser value never reaches a
provider call. `get_billing_provider()` is a single factory.

**This is the hard part and it is done.** A provider switch is an adapter plus
the leaks in 3.2 — not a rewrite. Preserve the protocol's shape above all: any
change that lets a provider concept into the signature undoes the work.

Equally preserved: persisted evidence — receipts, activations, webhook events —
already records `provider_mode` and the catalog revision, so settlement history
stays interpretable *across* a switch. That property is what makes migration
possible at all.

### 3.2 Hardcoded provider decisions to remove

Nine files mention Razorpay; six mentions are load-bearing outside the connector.

| # | Leak | Where | Why it costs at migration |
|---|---|---|---|
| 1 | Quote signing falls back to the Razorpay key secret | `app/domain/billing/quotes.py` | Quote integrity coupled to one provider's credential. An independent `BILLING_QUOTE_SIGNING_SECRET` is already specified in the Razorpay plan; finishing it is a security improvement regardless of provider. **Do first.** |
| 2 | Webhook ingress named for the provider: `POST /billing/webhooks/razorpay`, `X-Razorpay-Signature`, `X-Razorpay-Event-Id` | `app/api/billing.py` | A second provider needs a second route and a second signature path, with nothing forcing them to share dedupe, leases, receipts or redaction. Normalize to `POST /billing/webhooks/{provider}` with all shared machinery in shared code and only signature computation plus event parsing behind the adapter. |
| 3 | Callback DTO typed as `razorpay_payment_id` / `razorpay_subscription_id` / `razorpay_signature` | `app/domain/billing/checkout.py` | The *domain* speaks Razorpay. Rename to provider-neutral fields, accepting the current names as input aliases. |
| 4 | `BILLING_RAZORPAY_*` settings — mode, four readiness flags, key prefixes, API host, checkout hosts | `app/core/config/billing_settings.py` | Provider selection spelled into ~15 setting names; a second provider duplicates the block. Largest diff, lowest risk, genuinely deferrable until a second provider is real. |

Do 1–3 while Razorpay is the only provider. Portability work with one
implementation is cheap and provable; during a migration it competes with the
migration.

### 3.3 Three rules that must never become provider-shaped

The current code follows all three. A migration erodes these first, so they are
recorded as rules rather than left as observations:

1. **CiteLadder owns the quote.** Taxable value and tax-component allocation are
   ours, frozen per intent, never read back from provider invoice metadata.
2. **A callback is authentication, not entitlement.** Access follows captured
   payment evidence with amount and currency parity against the frozen quote —
   never a valid signature, never a provider status string alone.
3. **Uncertain is not failed.** Transport errors and 5xx leave the intent pending
   for reconciliation. `BillingProviderError.retryable` encodes this; every
   adapter must set it correctly, because a provider that reports uncertainty as
   failure will double-charge under retry.

### 3.4 Migration procedure: Razorpay to another provider

The order matters; each step is verifiable before the next.

1. **Confirm the protocol covers the new provider's model.** Recurring
   subscriptions, mandate/authorization semantics, refunds, and whether it
   reports uncertainty distinguishably. A provider that cannot express
   `retryable` needs that handled in its adapter, not in the domain.
2. **Write the adapter** against `BillingProvider`, mapping its statuses to the
   neutral DTOs. Largest piece of work, unavoidable under any design.
3. **Add the provider's signature verification and event parsing** behind the
   normalized webhook ingress from 3.2 #2. Shared dedupe, leases, receipts and
   redaction are reused, not reimplemented.
4. **Create a new catalog revision** holding that provider's private price
   references, with its own frozen FX and tax metadata. Never mutate a published
   revision: historical receipts must keep resolving against the terms they were
   sold under.
5. **Run both providers concurrently, read-only for the new one.** Existing
   subscriptions keep settling through Razorpay; new checkouts route to the new
   provider by catalog revision. `provider_mode` on persisted evidence is what
   makes this legible.
6. **Re-run the sandbox acceptance matrix** — the Razorpay plan's section 5,
   with that provider's supported methods substituted. Do not carry a passed
   route across providers.
7. **Migrate or expire existing subscriptions.** Most providers cannot transfer
   mandates; assume customers must re-authorize, and plan the communication as
   part of the migration rather than discovering it during one.
8. **Retire the old adapter only after** its last subscription reaches a terminal
   state and its reconciliation window closes. Keep its evidence readable
   forever.

### 3.5 What remains unimplemented in Razorpay itself

Carried from the Razorpay plan's handoff so this document is a complete picture.
None of it is authorized here; it is recorded so a later agent knows the true
state:

- Real sandbox captures, recurring-method acceptance, and GST parity have **not**
  been performed.
- International setup and readiness remain **unverified and disabled**.
- Merchant capability for Subscriptions, recurring methods and international
  recurring is **owner-reported, not verified**.
- Funded checkout remains **disabled** — its provider call charges the base plan
  only and does not match the funded quote.
- The tax verification gate is **unproven**: that the merchant's plan/invoice
  configuration produces a separate GST line and the exact quoted total. If it
  cannot, INR checkout stays unavailable.
- Enterprise remains contact-only; card trials, no-card campaigns, add-ons and
  top-ups stay disabled.

A provider migration decision should be made knowing that Razorpay itself is
**not yet proven in sandbox**. If that proving does not succeed, the migration is
not a fallback plan — it is the plan.

## Sequencing summary

| Phase | Contents | Blocking |
|---|---|---|
| 1 | `(authed)` layout, project id as durable URL state, gate contract, seeded-account coverage | Nothing. Ready to implement. |
| 2 | Members, roles, per-project access, invitations, billing ownership migration + ADR | Phase 1 (shares the provider and the URL it reads). Answer 2.4 first. |
| 3 | Quote-signing secret, normalized webhook ingress, neutral callback DTO; settings block deferred | Sequence 3.2 #1–3 after the in-flight Razorpay change merges — it edits `webhooks.py` and `checkout.py` too. |

Phase 3's de-hardcoding does not depend on Phase 2 and may proceed in parallel
once the Razorpay change lands. Phase 2's billing-ownership migration should not
begin while Phase 3 is mid-edit in the same billing modules.

## Decisions recorded

- **Project id in the URL:** keep it, visibly and permanently. Scrubbing it was
  the mistake, not showing it. (Owner, 2026-09-10.)
- **Test access:** a seeded password account is acceptable for local and CI
  verification of both project-creation flows; Google rate limits do not gate
  coverage. (Owner, 2026-09-10.)
- **Razorpay:** no implementation in Phase 3. Access is unavailable; the phase
  exists to remove hardcoded decisions and record the migration path.
  (Owner, 2026-09-10.)
