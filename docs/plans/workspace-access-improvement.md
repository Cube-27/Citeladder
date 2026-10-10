# Workspace access improvement plan

**Status:** decisions answered 2026-10-10; implementing as two sequential PRs
(PR 1: phases 1, 2 and 4; PR 2: phases 3 and 5).

Feature 12 of the [feature review tracker](feature-review-tracker.md):
authentication, sessions, workspaces, membership, roles and the project
lifecycle (create, edit, delete, selection). Project discovery and research
belong to feature 2; the Dashboard to feature 15; plans and entitlements to
feature 11. Shipped behaviour is owned by [Workspace access](../workspace-access.md),
not by this plan. Constraints: [invariants](../invariants.md), the single
migration baseline (schema changes edit `0001_baseline.sql`), and the free-tier
hosting budget (API: Cloud Run 512 MiB, 40 concurrent requests).

## Why

A read-only audit of the auth service and routes, workspace authorization,
membership and invitations, project lifecycle, the sign-in/Settings/Projects
screens and their tests (2026-10-10) found, after verification:

- **An Admin can take ownership.** Transfer requires only `manage_members`
  (`workspaces/service.ts` `transferOwnership`), and the roster shows
  "Make owner" on every row, including the acting admin's own. The admin then
  owns the workspace and can remove the demoted Owner.
- **Ownership transfer almost never succeeds for a real user.** With
  `max_owned: 1`, transfer refuses an incoming owner who already owns a
  workspace, but every user receives a personal workspace at registration and
  at every login (`provisionAccount`). Tests pass only because their fixture
  member owns nothing. A former Owner who owns nothing gets a fresh personal
  workspace at the next login.
- **"Exactly one Owner" exists only in application code.** `workspace_members.role`
  has no CHECK and no one-owner index; an unknown role 500s in the members and
  workspace views instead of failing closed.
- **A project that ever ran paid work cannot be deleted.** `agent_model_attempts.project_id`
  and the consumable ledger restrict deletion, so delete returns 409 and the
  project keeps its slot forever. Any Member can attempt the delete, and the
  Settings "Danger zone" shows it to Viewers.
- **The per-email login budget does not stop password guessing.** It is counted
  after Argon2 verification and never checked before it, so an exhausted budget
  turns a 401 into a 429 while a correct guess still logs in. Only the per-IP
  limit binds; the document claims the counter commits before verification.
- **Login CSRF.** No route checks Content-Type or Origin, and `readBody` parses
  any body as JSON, so a cross-site `text/plain` form POST to `/auth/login`
  signs the victim into the attacker's account. (There is no CORS, so requiring
  `application/json` closes it.)
- **Shared global counters are cheap to exhaust.** The daily trial counter is
  spent before registration (including duplicates) and the global mail counter
  on every forgot/resend for any address; a few IPs stop all signups or all
  reset mail for a day, silently.
- **Argon2 can exhaust the API's memory.** 64 MiB × parallelism 4 per hash on a
  512 MiB instance accepting 40 concurrent requests; eight concurrent logins
  fill the instance.
- **Half-wired providers and legacy policy.** GitHub and Apple have settings,
  labels and a provider listing but no implementation (sign-in redirects to
  them, then the callback refuses); a 501 POST callback route; a `legacy`
  registration origin that skips verification and is the column's database
  default (fails open); Python-provenance comments and a Python Argon2/JWT
  fixture test.
- **Duplicated role policy.** Search Intelligence (`role != 'viewer'`), internal
  link judgments, MCP and crawl-log sources re-derive the role matrix outside
  `auth/workspace.ts`.
- **Request cost.** Every product request runs about seven queries in five
  sequential round trips before the handler (session, membership, then
  `requireWorkspaceAccess` reading the billing account twice); project-authorized
  routes then re-read the project. The project view runs eight sequential
  queries on list, read, create and update.
- **Sign-in and Settings usability.** The Terms checkbox is required on every
  sign-in, not just registration or a new revision; the fallback Terms screen
  has no sign-out or workspace switch; Settings → Account shows the raw User ID,
  the platform role "User" and an always-Active badge, but not the current
  workspace or your role in it; sign-in methods appear as raw codes
  (`password, google`) and "Legacy or operator access"; there is no Leave
  workspace, no project rename, and member removal/transfer use `window.confirm`
  while revoking an invitation has no confirmation; the invite dialog has no
  form (Enter does nothing) and clears the email before the result; role
  changes apply on select; an empty member search shows an empty table.
- **Sign-out paths diverge.** Three of them skip the shared cleanup, so the
  stored workspace and project selection survive sign-out.
- **Smaller defects.** Logout and logout-all are the same operation; plain
  `Error`s become 500s (`workspace_not_found`, `workspace_has_no_owner`); a
  removed member's MCP grant keeps the workspace, so re-invitation restores MCP
  access without consent; Google sign-in records `auth.google_login` before the
  verification refusal; the per-token mailbox meter keys on a fresh token;
  `security_events` is never pruned; two redundant indexes; a `?tab=billing`
  Settings redirect shim.
- **Test debt.** `MemberSettings`, the roster and invitations have no tests;
  no test covers Admin transfer, a successful project delete, or the login CSRF;
  `auth-crypto.test.ts` tests `jose` and a Python fixture; `auth.test.ts`
  checks capabilities and denial wording against their config copies;
  `settings-screen.test.tsx` asserts tab labels, shown IDs, retired behaviour
  and a "Danger zone" tab that never existed; one route test locks in the
  login-budget weakness.

Verified sound: every product route goes through session → membership →
access → capability; foreign and missing projects both 404; invitation tokens
are hashed, single-use and identity-bound; continuation allows no open
redirect; membership mutations lock and recheck authority; MCP rechecks
membership live; query keys carry workspace identity.

## Decisions (owner, 2026-10-10)

1. **One owned workspace per person; access is one-to-many.** A workspace has
   exactly one Owner and a person owns at most one workspace; Admin, Member and
   Viewer memberships are unlimited. A person owns a workspace only once they
   create one, so signing up or signing in creates nothing: onboarding's first
   project creates the owned workspace and starts its trial. Someone who owns
   none can be made Owner elsewhere. Sign-in follows the Razorpay/Cloudflare
   model: a person with more than one destination chooses one (their own
   workspace, or "Set up your own" when they own none, plus every workspace they
   were invited to). This absorbs the backlog item "Sign-in workspace selection".
2. **Project deletion and trial expiry.** Delete appears only for projects in
   workspaces with a non-trial grant, and only Owner/Admin may use it. A trial
   workspace is deactivated when its 7-day trial ends and its projects are purged
   30 days after that. Deletion and purge really delete the project and its data;
   billing and usage records survive with their links to deleted audits, crawls
   and Agent turns cleared.
3. **Terms at signup and on a new revision only.** The sign-in form no longer
   carries the checkbox; the review screen appears only when the workspace has
   not accepted the current revision.
4. **UX addition: the workspace and members panel** (phase 5), with the sign-in
   chooser from decision 1.

## Phase 1: security and correctness (server)

| # | Change | Where |
|---|---|---|
| 1.1 | Transfer is Owner-only (a `transfer_ownership` capability held by `owner`); the limit follows decision 1 | `config/workspaces.json`, `workspaces/service.ts`, `routes/workspaces.ts` |
| 1.2 | Role CHECK and one-owner partial unique index in the baseline; unknown roles fail closed (no capabilities, no 500); typed 404/409 instead of plain `Error`s | `0001_baseline.sql`, `workspaces/service.ts` |
| 1.3 | (moved to phase 4) | |
| 1.4 | Login checks the per-email failure budget before verification; a successful login or password reset clears it | `routes/auth.ts`, `abuse/usage.ts` |
| 1.5 | Non-GET API requests a browser marks `Sec-Fetch-Site: cross-site` are refused | `routes/define.ts` |
| 1.6 | Global trial and mail counters are spent only when an identity or challenge is issued; exhaustion is logged | `routes/auth.ts`, `auth/challenges.ts` |
| 1.7 | Argon2 19 MiB, t=2, p=1 (existing hashes keep verifying: parameters are encoded per hash); the absent-user dummy hash is built once | `config/auth-runtime.json`, `auth/password.ts` |
| 1.8 | Removing a member or their leaving drops that workspace from their MCP grants in the same transaction | `workspaces/service.ts` |
| 1.9 | One role-policy owner: `memberAllows` in `auth/workspace.ts`, used by Search Intelligence, internal links, MCP and crawl-log sources | those modules |
| 1.10 | `/projects/{project_id}` routes all authorize through the project | `routes/projects.ts` |

## Phase 2: debt and cost

| # | Change | Where |
|---|---|---|
| 2.1 | Delete GitHub/Apple settings and labels, the 501 POST callback, the integration-client fallback for sign-in, the duplicate `detail` error field | `config/auth-oauth.json`, `auth/oauth.ts`, `routes/auth.ts` |
| 2.2 | Delete the `legacy` registration origin: no column default; operator identities are `operator` | `0001_baseline.sql`, `auth/eligibility.ts`, `entitlements/*` |
| 2.3 | One logout (signs out everywhere, which is what both do today); one client sign-out path that clears account-scoped state | `routes/auth.ts`, `lib/api/auth.ts`, `components/auth`, `components/settings` |
| 2.4 | Access resolution reads the billing account once; project-authorized routes stop re-reading the project; `/auth/me` reuses the session row | `entitlements/access.ts`, `state.ts`, route families |
| 2.5 | Project view: batch its eight sequential queries | `projects/service.ts` |
| 2.6 | `security_events` retention (365 days) pruned by the runner with `usage_windows`; Google login event only on an issued session; per-route mailbox meters | `workers/runner.ts`, `auth/oauth.ts`, `routes/auth.ts` |
| 2.7 | Drop the two redundant indexes, Python comments, the `?tab=billing` shim and stale comments | baseline, `auth/*`, `components/settings` |

Deferred to the backlog: replacing the production `DEV_LOGIN_*` gate with an
explicit entitlement (it gates crawl-log ingestion and crawl controls, so it
belongs with those features); sliding session renewal; per-device sign-out
(needs session rows); sign-in workspace selection (unless chosen in decision 4).

## Phase 4: project deletion and trial expiry (decision 2)

| # | Change | Where |
|---|---|---|
| 4.1 | Billing and usage references to audits, crawls, audit tasks and Agent runs/attempts become `ON DELETE SET NULL`; the ledger keeps workspace, account, amount and kind | `0001_baseline.sql`, `entitlements/ledger.ts` readers |
| 4.2 | Delete requires `manage_members`-level authority (Owner/Admin) and a workspace with a non-trial grant; trial workspaces get 403 with a reason; deletion frees the slot | `projects/service.ts`, `routes/projects.ts`, `config/workspaces.json` |
| 4.3 | Runner sweep purges projects of workspaces whose only grants are trial grants that ended more than 30 days ago, a bounded batch per pass | `workers/runner.ts`, `projects/service.ts` |

## Phase 3: usability

| # | Change | Where |
|---|---|---|
| 3.0 | Ownership per decision 1: no workspace at signup or login; onboarding creates the owned workspace (`POST /workspaces`) before the first project; the bootstrap and app gate handle a user with no workspace; transfer accepts an incoming user who owns none | `auth/service.ts`, `auth/oauth.ts`, `workspaces/service.ts`, `lib/project/bootstrap*`, `components/onboarding` |
| 3.1 | Sign-in workspace chooser: after sign-in, a person with more than one destination picks one (name, role, access); one destination enters directly | `components/auth`, `lib/project` |
| 3.2 | Terms per decision 3; the fallback Terms screen gets sign-out and workspace switching | `components/auth` |
| 3.3 | Settings → Account: no User ID, platform role or Active badge; readable sign-in methods and verification state; Connect Google explains its password requirement | `settings-screen.tsx`, `account-security.tsx` |
| 3.4 | Members: design-system confirmation dialogs for remove, revoke and transfer (Owner-only); role change confirms; invite dialog is a form that keeps the email until success and shows errors in the dialog; readable role and expiry on invitations; empty search message | `member-*.tsx` |
| 3.5 | Role-aware controls: Viewers do not see Edit project, Add project or Delete project | `dashboard-controls.tsx`, `projects-screen.tsx`, `settings-screen.tsx` |
| 3.6 | Project rename in the edit panel | `project-edit-panel.tsx` |
| 3.7 | Mailbox screens: a missing token shows a "link incomplete" state; resend-verification has its own description | `mailbox-screen.tsx` |

## Phase 5: workspace and members panel (UX addition)

Settings shows the current workspace, your role and what it allows; Leave
workspace (non-owners); Owner-only Transfer ownership in a dialog that names who
becomes Owner; and the member changes in 3.4.

## Tests

Add: Admin cannot transfer; transfer to a user with a personal workspace;
successful project delete frees the slot; a Viewer and a Member per the decided
delete capability; login budget refuses a correct password once exhausted and
resets on success; a `text/plain` POST is refused; removal drops MCP grant
scope; member roster role change, remove and transfer through the UI.

Delete: `auth-crypto.test.ts` (library and Python fixture), capability and
denial-wording copies in `auth.test.ts`, the label/ID/retired-behaviour and
phantom-tab assertions in `settings-screen.test.tsx`, the `?tab=billing` test,
the class/order assertions in `flow-shell.test.tsx`, the tautological render in
`projects-screen.test.tsx`; rewrite the route test that locks in the login
budget weakness.

## Acceptance

- An Admin's transfer request is 403 and the roster offers transfer only to the Owner.
- A user with a personal workspace can receive ownership per decision 1.
- A project with Agent and audit history can be deleted per decision 2, and its slot is free.
- A correct password after an exhausted per-email budget is refused until the window passes or the password is reset.
- A cross-site `text/plain` login POST does not set a cookie.
- Settings → Account shows no internal IDs; Viewers see no write controls.
- `docs/workspace-access.md` describes the shipped behaviour.
