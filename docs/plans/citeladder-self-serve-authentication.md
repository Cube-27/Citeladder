# Self-serve authentication, verified email and trial access

Status: repository implementation complete on 6 October 2026; PR/CI review pending.
Public rollout, deployed-schema compatibility and live-provider acceptance remain
separately authorized operations.
Date: 5 October 2026. Repository inspection baseline: `04c5c0a32`.

## Outcome and scope

Enable Google signup/sign-in and email/password signup with mandatory email
verification for new public accounts. Extend the attached self-serve lifecycle:
one seven-day trial, contact-led continuation after expiry, Resend transactional
mail, password recovery, invitation delivery and account security controls.
This plan treats the attachment as the broader scope and adds verification as
a prerequisite to public launch. Implementation should use a new worktree from
then-current `main`; saving this plan does not start that work or create a PR.

Extend native auth, workspace, billing and entitlement owners. Keep paid checkout
and Razorpay disabled. No auth vendor migration, parallel entitlement store,
MFA, magic-link login, email changes, account deletion, device history or visual
redesign. Preserve existing customer/operator access and all expired-trial data.

Owners: [workspace access](../workspace-access.md),
[billing and entitlements](../billing-entitlements.md),
[launch policy](../operations/CiteLadder_Launch_Config.md), and the affected
[invariants](../invariants.md). Repository workflow and schema rules take
precedence over the attachment's generic migration instructions.

## Current implementation and gaps

| Area | Inspected behavior | Required change |
| --- | --- | --- |
| Email signup | `auth/service.ts` inserts an active identity, provisions access and returns no session; `routes/auth.ts` gates registration | Persist pending verification; block product authentication until verification |
| Google | `auth/oauth.ts` exchanges code, fetches Google userinfo, requires verified email for new linking, uses signed state/cookie binding | Preserve protections; distinguish new signup from existing login; harden email linking and carry auth continuation |
| Signup flags | Email registration checks `PUBLIC_SIGNUP_ENABLED`; Google account insertion does not check it | Enforce the public creation gate in both paths; existing Google login remains independently enabled |
| Bootstrap | `workspaces/service.ts` provisions on signup, login and Google login; `entitlements/bootstrap.ts` issues a permanent free bundle | Persist registration provenance; public trials must never acquire the permanent fallback on later login/repair |
| Trial | Billing has trial grant vocabulary and `BILLING_TRIAL_DAYS=7`; `billing/journeys.ts` no-card campaign issues Tier 1 grants | Implement the distinct public trial profile, not the campaign or paid plan bundle |
| Verification | Provider identity stores `email_verified`; native identity/session has no email verification gate | Add explicit identity verification state and purpose-bound tokens |
| Sessions | `logoutUser()` already increments `session_version` and records an event | Reuse this primitive for explicit sign-out-all; retain current logout semantics |
| Email | Resend is used by marketing contact mail; invitations have token persistence but no mail transport | API-owned transactional delivery for verification, reset and invitations |
| Continuation | `frontend/lib/auth/mcp-return-path.ts` accepts MCP consent only; OAuth redirects to configured landing path | One validated auth continuation owner covering invitations and existing MCP flow |
| Deployment | Workers derive `NEXT_PUBLIC_SELF_SERVE_SIGNUP` from repository `SELF_SERVE_SIGNUP`; API has a separate flag | Coordinate backend readiness and both frontend builds |

Paths above are relative to `frontend/services/api/src/` unless written otherwise.
Also inspect callers, tests, generated contracts, native operators and deployment
bootstrap again at implementation start; this is a snapshot, not a frozen diff.

## Proposed lifecycle decisions

### Email verification and account safety

1. Register creates a pending public identity, personal workspace, billing account
   and exactly one trial in a single transaction. Keep administrative `is_active`
   separate from email verification. Return a generic acknowledgement and no
   product session. Pending identities cannot read customer data, invite members,
   obtain MCP grants or trigger billable work.
2. Add identity verification timestamp/method and an explicit persisted registration
   origin or equivalent requirement marker. New public email registrations require
   verification. Existing accounts remain eligible under an explicit legacy policy;
   never invent historical verification timestamps. Operator-created identities
   retain their current access policy, with no automatic public trial.
3. Send a verification link through Resend. Propose a 24-hour lifetime, 60-second
   resend cooldown and one current token per identity/purpose, all config-owned.
   Use 32 random bytes, SHA-256 digest-only persistence, exact identity/email/purpose
   binding, expiry and atomic consumption. Verification and password-reset tokens
   are never interchangeable.
4. Opening the link renders a confirmation screen. Only an explicit POST consumes
   it; mail scanners/prefetch GETs must not verify an account. Require the signup
   password again when confirming: a mailbox owner must not accidentally activate
   a password chosen by someone who preregistered their address. Offer password
   recovery if they did not initiate signup or do not know that password.
5. On success, mark verified and consume sibling verification tokens atomically,
   record a bounded security event, then return to login with the validated
   continuation. Do not create an automatic session from the email link. Correct
   password login on a pending identity may return a verification-required state
   without a session; wrong credentials retain the generic failure.
6. Expired, consumed, malformed and superseded tokens have safe recovery copy.
   Resend never changes the password, registration timestamp or trial deadline.
   Duplicate registration never overwrites an existing identity or credentials.
7. Successful password reset may also establish email ownership for a pending
   identity, explicitly in the same transaction, because it replaces the old
   password after mailbox proof. Consume outstanding verification/reset tokens and
   revoke sessions. Reset-request alone changes nothing.
8. Verification/reset screens carry no analytics or third-party resources; use
   no-store/referrer protections and remove secrets from the URL after capture.
   Redact token-bearing paths and nested continuations in access/application logs.
   Keep tokens out of browser persistent storage and event metadata.

Proposed endpoints under the existing auth family: `POST /auth/verify-email`,
`POST /auth/resend-verification`, `POST /auth/forgot-password`,
`POST /auth/reset-password`, `POST /auth/change-password`, and
`POST /auth/logout-all`, all browser-facing through `/api/v1`. Final names follow
the route manifest and shared contract owner. Screens include `/verify-email`,
`/forgot-password`, `/reset-password` and the registration confirmation state.

### Google identity and safe linking

Preserve signed state, HttpOnly transaction cookie binding, callback expiry,
provider allowlist, redirect refusal, timeouts and response-size limits. Keep
provider subject as the durable identity key. Continue using the current code
exchange/userinfo owner; do not assume it already validates an ID-token flow.

For a new identity, accept Google mailbox proof only when `email_verified` is
true and Google is authoritative for the address: Gmail or a validated Google
Workspace `hd` claim. Parse the needed claim under the bounded provider schema.
Other third-party Google addresses require CiteLadder email verification before
product access. Do not infer Workspace membership merely from an email suffix.

An already linked Google subject continues to identify its existing user; do not
silently change the canonical account email when userinfo changes. A new provider
subject matching an existing verified/local account requires proof of that
existing account before linking (existing credential or a purpose-bound mailbox
challenge). A same-email pending public account must not retain an attacker-set
password when claimed through authoritative Google proof: clear its unverified
password, revoke sessions/tokens and link atomically, or complete the explicit
recovery challenge first. Preserve inactive-account and conflicting-subject refusal.

Serialize email/subject races with the existing advisory-lock and uniqueness
owners. Simultaneous email signup and Google signup yield one identity and one
trial. Existing login/linking never creates a second trial. Disabling public
signup prevents new Google identities without blocking existing linked users.

### Abuse prevention

Email verification establishes mailbox control; it cannot establish that a user
is human or prevent disposable-mail farms. Public launch therefore also requires:

- PostgreSQL-backed request budgets by trusted client and normalized email for
  signup, verification attempts, resend, reset and OAuth start/callback. Apply
  admission before expensive Argon2 work or provider/email I/O.
- A recipient cooldown/daily send budget and global mail/funded-trial budget to
  bound email bombing and aggregate spend. Keep values in native config; preserve
  successful-credential handling and avoid attacker-triggered permanent lockouts.
- Consistent public registration/resend/recovery response envelopes for unknown,
  existing and pending addresses, without account-dependent provider error leaks.
  Bound timing differences; do not advertise successful inbox delivery.
- Security-event counts for signup, verification, throttling, send failures and
  trial consumption, without token/email-body logging. Validate proxy identity
  handling so client headers cannot bypass limits.
- A launch review of measured abuse controls. If a browser challenge is needed,
  add a separately configured server-validated challenge before resource issuance;
  never treat a frontend checkbox as enforcement. A challenge is an escalation
  option, not an assumed new provider dependency in this implementation.

Retain current normalization consistently across all auth paths; do not strip
Gmail dots or plus suffixes to create a new identity-merging rule. One trial per
billing-account lifetime is not a claim of one trial per human.

### Trial and workspace access

Trial starts at persisted `users.created_at` (the billing registration cohort),
not verification, first login or project creation. It ends exactly seven days
later in UTC. Waiting for verification consumes trial time; copy must say this.
Verification after expiry permits account recovery but does not revive access.

| Trial allowance | Policy |
| --- | --- |
| Duration | `BILLING_TRIAL_DAYS`, release value 7 |
| Capacity | 1 project, 20 prompts, 20 monitored URLs |
| Engines | ChatGPT only |
| Execution | 1 successful run per prompt, 20 successful answers total |
| Agent / AI credits | Disabled / 0 |
| Reset / reclaim | No daily reset; one claim per billing-account lifetime |
| Payments | No card, charge, checkout or subscription |

Persist public registration provenance with the billing account/claim. Issue an
immutable trial bundle with a stable idempotency key and original deadline; no
permanent signup baseline underneath it. All bootstrap callers must respect this
persisted classification, including login repair and explicit operator repair.
Do not rely on a caller's transient `newUser` boolean to prevent later fallback.
Preserve existing non-public grants; never globally revoke old free profiles.

Extend the existing entitlement owner with workspace access resolution:
`active`, `trial_active`, `trial_expired`, `access_unresolved`. Role/membership
authorization remains required independently. Missing authority fails closed for
product data while allowing safe recovery; do not label it expired. Valid explicit
access restoration wins over expired trial history. Capacity-only supplements,
credit top-ups or an arbitrary grant must not accidentally unlock access.

Enforce the policy at common REST/project/workspace boundaries and at MCP,
Agent tools, exports, integration reads, queue admission and worker execution.
Audit the complete route/task inventory for bypasses, including assets containing
customer data. At the deadline deny new access and provider dispatch even if a
cached projection says active. Queued work rechecks access before network I/O;
already-dispatched work may settle immutable usage/evidence but starts no further
paid steps. Reads resolve persisted evidence and time without repairing state.

Enforce successful-answer limits using existing reservations/settlement and the
account lock. Reserve capacity before dispatch; release on unsuccessful attempts,
settle success exactly once. Preserve per-prompt successful-use evidence across
prompt edits/deletion; creating replacement prompts cannot exceed the total cap.
Bound failed attempts separately through existing execution policy.

Expired workspace recovery permits session/account security, minimal membership
and access discovery, switching workspace, Terms and invitation acceptance. It
does not disclose product content. An active invited workspace remains usable
even when the user's personal trial expires. UI shows a blocking accessible
expired-access state with Contact support, Sign out and eligible workspace switch.
Use the canonical marketing contact helper, no checkout recovery CTA. Clear or
partition cached product data on access loss and workspace changes.

Manual restoration uses existing platform-operator grant mechanisms where
possible: explicit workspace, active platform admin, reason, dry-run preview,
idempotency and append-only evidence. Extend only the missing bounded operation;
never repurpose a development allowance as customer access or silently renew trial.

## Delivery and supporting flows

Create one API-side transactional email adapter using Resend, with sender
`notifications@citeladder.com`, support reply destination `contact@citeladder.com`,
text/escaped HTML alternatives, timeout and sanitized failure reporting. Inspect
canonical contact constants before duplicating configuration. Marketing runtime
code must not be imported into the API.

Initial bounded delivery design: commit identity/token/invitation before sending;
hold the raw token only in request memory, persist only its digest, then perform
the bounded send outside the transaction. Use a unique logical-delivery idempotency
key for retries of the same message. A crash after commit is recoverable by resend,
which rotates the token after cooldown; there is no durable-delivery guarantee.
Do not put plaintext bearer tokens into a queue to claim hash-only storage. If
durable retry becomes a release requirement, resolve encrypted payload retention
explicitly under the existing PostgreSQL queue before implementation.

Provider acceptance is not proof of inbox delivery. Public auth flows use generic
acknowledgements; systemic mail unavailability can disable new signup without
enumerating accounts. Authenticated invitation creation/resend may report
provider acceptance/failure honestly and retain the one-time copy-link fallback.
Never roll back an invitation because a post-commit send failed. Resend rotates
the invitation token; retain seven-day expiry, matching verified identity, allowed
roles, single use and workspace isolation.

Generalize the MCP-named return-path helper into one auth continuation owner;
inventory and migrate all callers, then remove the superseded helper. Permit only
bounded, reconstructed app-relative destinations and expected parameters. Preserve
invitation/MCP continuations across registration, verification, login and Google
callback. Bind OAuth continuation to its transaction; do not put invitation bearer
tokens into provider-visible signed-only state. Use protected short-lived storage
or an opaque transaction reference. Reject external URLs, protocol-relative paths,
encoded redirect tricks and unexpected query parameters.

Password reset uses a proposed 30-minute purpose-bound token. Its transaction
updates Argon2 password, increments session version, consumes all outstanding
reset tokens, applies the explicit pending-verification policy and records the
event. Return to login. Password change requires current password and rechecks
the hash/session version under lock after Argon2 verification; it signs out every
session, including the current device. OAuth-only users use email password setup.

Account settings display read-only email and actual server-reported sign-in
methods/verification state. Explicit Sign out all sessions asks for UI confirmation,
reuses session-version revocation, clears cookies/caches and returns to login.
Do not weaken ordinary logout, which already revokes all sessions.

## Dependency-ordered implementation slices

| Slice | Owners and deliverable | Exit evidence |
| --- | --- | --- |
| 1. Persistence and policy | `backend/app/models/user.py`, identity/billing models, `migrations/versions/0001_initial.py`, native auth/billing config, generated Kysely schema and `frontend/packages/contracts/src/auth.ts` | Pending/legacy/operator distinctions; token uniqueness/expiry; trial provenance; empty disposable DB schema generation |
| 2. Mail and verified auth | `auth/`, `routes/auth.ts`, `abuse/`, API email adapter, auth forms/routes and `frontend/lib/api/auth.ts` | Verification/reset races, recovery, abuse limits, delivery failure and no access before verification |
| 3. Google and continuations | Existing OAuth owner, auth return helper/callers, invitation route and auth screens | Gate new accounts, safe linking, state/cookie failures, invitation/MCP return through every auth method |
| 4. Trial issuance and enforcement | `workspaces/service.ts`, `entitlements/bootstrap.ts`, grant resolver/ledger, billing claims/reads, runtime admission and common authorization owners | No fallback/reissue; exact expiry; real PostgreSQL capacity/concurrency; REST/MCP/worker denial and manual restoration |
| 5. Customer surfaces | Entitlement context/shell, account security, invitation settings, marketing nav/mobile/hero | Verified onboarding; accessible expiry recovery; workspace switching; truthful delivery states; gated signup CTAs |
| 6. Release configuration and docs | API config/secret injection, GCP and both Workers workflows, owner docs/runbooks | Mocked end-to-end acceptance, fail-closed configuration, provider setup checklist and staged launch |

Keep public flags off until all dependent slices pass. Reuse existing component
primitives. Marketing navigation exposes Log in / Sign up; hero preserves Book a
demo and changes the existing secondary slot to Start free trial via `appHref()`.
Align other existing self-serve slots without replacing educational links.

Schema additions stay in the singular initial migration, followed by generated
types; never hand-edit generated output. Verify only against a disposable DB.
An edited initial migration does not upgrade an existing deployed database:
inventory the live schema/data before rollout. If durable production data requires
forward migration, obtain an explicit repository migration-policy decision and
an additive deployment procedure. Never reset shared/staging/production data or
ship code expecting absent columns. Legacy-account classification must preserve
access without asserting unsupported email-verification evidence.

## Validation and acceptance

Use the lowest meaningful owner boundary and existing suites, adding focused
cases where a new contract requires them:

- Auth routes/crypto: signup disabled for both creation methods, generic duplicate
  responses, pending-session denial, scanner GET inertness, bad/expired/replayed
  tokens, concurrent consume/resend/reset, and preregistration takeover resistance.
- Google: authoritative versus third-party email proof, bad state/cookie/subject,
  inactive accounts, email collision, repeat login and concurrent first signup.
- PostgreSQL billing/entitlements: single issuance, original deadline, no baseline
  after login/repair, legacy/operator preservation, quota races and success/failure
  settlement, deadline minus one instant versus deadline, persisted data retained.
- Authorization: expired REST/MCP/export/integration access and queued execution
  denied; account recovery works; another active workspace works; manual explicit
  grant restores the same data; missing authority never becomes access.
- Mail/security: escaped content, trusted link origins, post-commit provider calls,
  timeout/failure, same-delivery retry, rotated-token invalidation, session-version
  races and all old sessions rejected after reset/change/logout-all.
- UI/focused browser journeys: pending email to verification/login/onboarding;
  first Google signup; invitation through verification/password/Google; wrong-email
  refusal; expired access on refresh/direct URL; switch workspace; enabled/disabled
  marketing CTA behavior and keyboard-accessible confirmation/recovery.

Start with existing native suites such as `auth-routes.test.ts`, `auth.test.ts`,
`auth-crypto.test.ts`, `workspaces.test.ts`, `workspace-scope.test.ts`,
`entitlements.test.ts`, `billing-boundaries.test.ts` and affected admission/MCP
suites. Select cases by changed behavior, not every file named in this plan.
From `frontend/`, use `pnpm --filter @citeladder/api test <selected test paths>`
and `pnpm test <selected UI test paths>` as appropriate. API tests require
`API_TEST_DATABASE_URL` naming an Alembic-migrated disposable PostgreSQL database;
use the documented deterministic configuration and remove inherited live secrets.
Mock Google/Resend; routine tests must not call live providers or send mail.

For schema changes, use `alembic upgrade head` and `alembic check` under the
documented schema environment, then `pnpm --filter @citeladder/api db:types` with
`TYPES_DATABASE_URL` targeting that disposable DB. Run `./scripts/check.ps1
-CheckOnly` once after the executable diff is complete, since contracts,
persistence and authorization change. Use `-All` only if shared-config changes
actually require it. Do not reproduce full CI locally or overlap checks. Native
test output uses one reusable log in the worktree Git directory.

Review final diff with [Review.md](../../Review.md), inspect `git diff --check`,
`git diff --stat` and `git diff --name-status`; report removals/caller cutovers,
commands/results, skipped checks and unresolved deployment dependencies. CI owns
the complete selected suites, production builds and broader E2E coverage.

## Rollout and completion

Repository routing and both [GCP](../operations/GCP_RUNBOOK.md) and
[Workers](../operations/WORKERS_RUNBOOK.md) runbooks identify this production
Google redirect URI: `https://app.citeladder.com/api/v1/auth/oauth/google/callback`.
Register it exactly in Google Console and verify against actual deployed routing
at rollout. Local/staging origins need their own explicit callback registrations.

| Configuration | Release intent |
| --- | --- |
| `PUBLIC_SIGNUP_ENABLED` | Enable only after verification/trial enforcement acceptance |
| `SELF_SERVE_SIGNUP` | Repository variable enabling both Workers' `NEXT_PUBLIC_SELF_SERVE_SIGNUP` builds |
| `OAUTH_GOOGLE_ENABLED` | Enable with valid server-side Google configuration |
| `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GOOGLE_REDIRECT_URI` | Server-only configuration, fail clearly when enabled but incomplete |
| `RESEND_API_KEY` | Add to API secret/config injection; currently documented for marketing only |
| Sender/domain | Verify Resend sender domain and delivery to controlled inboxes |
| `BILLING_TRIAL_DAYS` | 7 |
| `BILLING_CHECKOUT_ENABLED`, `BILLING_RAZORPAY_MODE` | `false`, `disabled`; do not silently alter intentionally different environments |
| Auth/mail abuse settings | Centralized, validated TTLs, cooldowns, request/send budgets and trusted origins |

Deploy schema-compatible API behavior with public flags off; validate mocked
journeys and explicitly authorized controlled-inbox/Google acceptance; enable API
creation and rebuild product/marketing flags together. Confirm verification,
signup, trial and throttling outcomes before broad exposure. Configuration alone
is not proof of provider setup or delivery. Secrets never enter public bundles.

Rollback closes new public registration and hides signup CTAs while preserving
existing login, verification/recovery and workspace access policy. Never remove
the verification or expiry gate to mitigate an outage; retain persisted grants,
tokens and customer data. Use compatible code/schema rollback procedures.

After implementation, update only changed canonical owners: workspace access,
billing/entitlements, launch configuration, deployment runbooks and relevant env
examples. Reconcile overlapping retained shell-plan invitation/sign-in work when
it is actually completed; do not mark it shipped now. Record PR evidence and
remaining operator actions in the PR, not extra progress sidecars. Completion
requires verified email enforcement, Google login/signup, exactly one bounded
trial, server-enforced expiry with recoverable data, invitation/recovery delivery,
security controls and coordinated release configuration. Public deployment and
live provider operations require their own explicit task authorization.

## External references

Consulted 5 October 2026; these support security/provider details, not repository
ownership or claims that the implementation has shipped.

- [OWASP email verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html): time-limited, single-use mailbox proof and anti-enumeration controls.
- [Google backend authentication](https://developers.google.com/identity/sign-in/web/backend-auth): when Google is authoritative for an email address and when another challenge is needed.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): provider deduplication lasts 24 hours; it is not permanent application delivery evidence.
