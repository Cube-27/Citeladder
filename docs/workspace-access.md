# Workspace and project access

## Responsibility

A User is an authenticated identity; a Workspace is the product-data and billing
boundary; a Project belongs to one workspace. A user owns one workspace and may
join others by invitation. One designated Owner must remain in each workspace.
The designation is distinct from platform/operator administration.

## Authentication and authorization

[Auth API](../frontend/services/api/src/routes/auth.ts) and
[auth service](../frontend/services/api/src/auth/service.ts) own session establishment.
Registration returns a generic acknowledgement rather than a session, and is
refused unless `PUBLIC_SIGNUP_ENABLED` is set; operators otherwise create
accounts with the native `account:manage` CLI. New public identities are pending
until mailbox verification; operator-created identities retain their explicit
access policy without invented verification timestamps. Every identity names its
origin (`public` or `operator`); any other origin requires verification. Google sign-in is gated
by `OAUTH_GOOGLE_ENABLED`; new Google identities also require `PUBLIC_SIGNUP_ENABLED`
and a sign-up start. Every Google start carries the Terms decision made on the
sign-in or sign-up form (`accept_terms` and the published `terms_revision`,
sealed in the signed state); a start without it is refused. Only a start from the
signup form (`signup=true`) may create an account. Google started from sign-in never creates one:
an unknown address is redirected to `/register` with the address prefilled and a
`oauth_signin_no_account` notice.
Domains reserved by RFC 2606 and RFC 6761 (`mailbox.reserved_domains`: `.test`,
`.example`, `.invalid`, `.localhost`, `example.com`, `example.net`,
`example.org`, and names under them) can never receive mail
([reserved domains](../frontend/services/api/src/auth/reserved-domains.ts)).
Public sign-up refuses them before writing or mailing anything:
`POST /auth/register` answers 422 `email_domain_reserved` (details
`field: email`), and a Google sign-up redirects with
`oauth_signin_email_reserved`. Operator and test fixtures may still hold such
addresses; no auth or invitation mail is sent to them and no signup notice
reports them. The same sign-up domain gate refuses a disposable-mailbox domain,
or any name under one, from the configured
[disposable list](../frontend/services/api/src/config/disposable-email-domains.json)
(CC0-1.0 disposable-email-domains project; its header names the pinned source
commit and date; a person refreshes it with
`pnpm --filter @citeladder/api disposable-domains:refresh` and commits the diff):
422 `disposable_email_domain` (details `field: email`), or a Google sign-up
redirect with `oauth_signin_email_disposable`. Existing accounts on such
domains keep signing in. Invitations create no account (the invitee signs up),
so they pass through the same gate.

Cloudflare Turnstile guards account creation, the public email-link requests,
and sign-in after repeated failures
([human verification](../frontend/services/api/src/auth/human-verification.ts)).
`POST /auth/register`, `POST /auth/resend-verification`,
`POST /auth/forgot-password` (body `turnstile_token`) and a Google sign-up start
(`signup=true&turnstile_token=…`) are verified in the API, after the request's
own client budget and before the address's budget, any account row or any mail.
The widget must have been solved for that request's action (`signup`,
`resend-verification`, `forgot-password`) on the app host (`FRONTEND_URL`). A
missing, invalid, replayed or mismatched token answers 403
`human_verification_failed`; a missing secret outside development, a Cloudflare
test secret in production, or siteverify being unreachable answers 503
`human_verification_unavailable` (fail closed). Development and test default to
Cloudflare's always-pass test secret, answered locally without a network call
(it accepts only the dummy token `XXXX.DUMMY.TOKEN.XXXX`). A signed-in person
asks for their own password link with the session-authorized
`POST /auth/password-link`, which needs no token.

Sign-in (`POST /auth/login`) is challenged (action `login`, body
`turnstile_token`) once, in the current sign-in window
(`ABUSE_LOGIN_WINDOW_SECONDS`), the address has failed
`ABUSE_LOGIN_CHALLENGE_FAILURES` (5) times, the visitor's network has failed
that many times across any accounts, or failures everywhere have reached
`ABUSE_LOGIN_FAILURE_GLOBAL_LIMIT` (200). Past a threshold, a sign-in without a
solved token answers 403 `human_verification_failed` before any password is
hashed. Reaching a threshold never refuses a solved sign-in, so the global
ceiling cannot lock everyone out. A successful sign-in forgets the address's
failures, not the network's. The sign-in form shows the widget after that
refusal and holds submit until it is solved.
Every per-visitor (`client`) budget, sign-in, sign-up, email-link requests,
client error reports and MCP registration and authorization, counts the
visitor's network rather than the exact address
([client identity](../frontend/services/api/src/auth/client-identity.ts)): an
IPv4 address as it is, and an IPv6 address by its /64, or by its /56 for
sign-up and MCP registration. Turnstile's `remoteip` still names the exact
address.
Email/password login and Google sign-in establish the HttpOnly session;
session-version checks invalidate stale sessions. Neither signing up nor signing
in creates a workspace. Onboarding creates the person's own workspace
(`POST /workspaces`) before its first project; that request carries the
published Terms revision, is refused (`terms_decision_required`) unless the
creator's account holds the Terms decision recorded at sign-up or sign-in, records the workspace
acceptance, spends the shared
daily trial budget for a public identity, and starts the trial. A person has one
trial: a workspace created after handing ownership away inherits the window of
their first. The frontend crosses the
identity boundary with full-document navigation so a prefetched anonymous
layout cannot be reused. Crossing cancels in-flight requests and removes the
stored project selection first; the departing page stays drawn until the next
document replaces it, its query cache is dropped when the page is hidden, and a
copy restored from the back-forward cache reloads.

TypeScript issues sessions and owns OAuth, abuse policy and Argon2 parameters.
Native account administration, local login and deployment bootstrap share the
password owner. Google sign-in
uses a signed state bound to an HttpOnly transaction cookie and verified email
before accepting authoritative Gmail/Workspace mailbox proof. Linking an existing
verified account requires its current password through Account security. Claiming
a pending public identity with authoritative Google proof clears its password
and invalidates old sessions/challenges. Third-party Google addresses use mailbox
recovery before access. Provider requests have host, redirect,
deadline and response-size bounds. PostgreSQL abuse counters commit before
password verification or provider I/O. Every sign-in attempt, and every
current-password check when changing a password or linking Google, spends a unit
of its email's failure budget before the password is checked, so concurrent
guesses cannot exceed it; a spent budget refuses even the correct password (429)
until its window passes, and a correct password or a password reset clears it. The shared daily trial and mail budgets are spent only
by identities and mail actually issued. A non-GET request a browser marks
`Sec-Fetch-Site: cross-site` or `same-site` is refused, so another site cannot submit a sign-in
or any other write. JSON routes also refuse a body not sent as
`Content-Type: application/json` (415), so a form or plain-text post that skips
the CORS preflight never reaches them. Google is the only sign-in provider.

[TypeScript authorization](../frontend/services/api/src/auth/workspace.ts) resolves
membership and exposes safe capabilities; it is the one owner of the role
matrix, which other modules query through it. Flat APIs use an explicit
workspace header or, without one, the user's default membership (the earliest,
ties broken by membership ID); a header that is empty or not a UUID is a 400,
never the default. Routes under a project path
declare their project rule, never trusting the ID alone:
`authorize: 'active-project'` requires the active workspace (resolved as for a
flat route) to hold the project, and `authorize: 'project'`, for the detail read
a link opens and for logos an `<img>` requests, resolves membership through the
project ID without reading the header. Handlers and the reads they call never
re-check the project. An Agent chat route (`/agent/chats/{chat_id}`) reads the
chat once in the active workspace, which names its project; the Agent's own
[access re-check](../frontend/services/api/src/agent/access.ts) runs only inside
admission and output-write transactions and at each step of a running turn, so a
revocation that commits first still stops them. A project ID from a body, a
query, an API key's path, an MCP tool or a worker goes through the one
[project guard](../frontend/services/api/src/projects/access.ts) or its owner's
equivalent.
Foreign and missing objects do not reveal product data.

Each browser request authorizes in two round trips
([session](../frontend/services/api/src/auth/session.ts),
[route definition](../frontend/services/api/src/routes/define.ts)): one statement
proves the session and resolves its membership (and the path's project), then one
parallel batch reads the workspace's entitlement state for the access gate. The
resolved user, workspace and entitlement state stay on the request context, so a
handler that needs the account, a capability flag or an allowance reuses them
instead of reading again; `/auth/me` answers from the session read. Nothing is
cached across requests, so removed membership, a revoked grant or an ended trial
applies from the next request ([decision](decisions.md#platform-and-schema)).
Workers keep their own short-lived access reuse (`cachedWorkspaceAccess`).

The [native role policy](../frontend/services/api/src/config/workspaces.json)
owns the authorization matrix. Viewer is read-only, Member also writes and
runs, Admin also manages billing, members, credentials and project deletion,
and only the Owner transfers ownership.

Registration origin is `public` or `operator` in the schema. The schema accepts only these four roles, at most one Owner per workspace and at
most one owned workspace per person; Admin, Member and Viewer memberships are
unlimited. A role outside the matrix confers nothing. Role authorization and entitlement availability are
separate checks; both must permit an action. The app does not render a control
whose capability the caller's role lacks (hidden, not disabled; owner decision
[AR-7 of the audit](decisions.md#audit-remediation-owner-2026-11-12)).
It reads the capabilities the workspace response publishes through one hook,
`useWorkspaceCapability`; the server still refuses every denied action itself.
Workspace Admin is not an operator
authorized to publish the global billing catalog or administer other workspaces.

## Membership and ownership continuity

Every workspace a person opens needs their acceptance of the current Terms
revision (`/workspaces/{id}/policies`). This covers password, Google-created and
operator-created identities. There is no consent screen after sign-in: the
sign-in and sign-up forms carry one agreement statement that covers every way
in (email and password, Google). `POST /auth/register`, `POST /auth/login` and every
Google start refuse a request without `accept_terms` and the published revision
(`GET /auth/policies`, public). The decision is recorded in
`account_policy_acceptances` (actor, revision, context `signup` or `signin`,
timestamp; append-only, the first decision on a revision kept and repeats inert)
when the person authenticates: with the new account at registration or a Google
sign-up, on a successful password sign-in, and in the Google callback's
transaction when it issues a session. `GET /auth/terms` reads it. Creating a
workspace and recording a workspace acceptance (`POST /workspaces`,
`POST /workspaces/{id}/policies`) are refused (`terms_decision_required`)
without that account decision on the revision they name, so the request flag
alone is never consent. The shell's policy gate records the acceptance for a
workspace the person opens without one (one they joined) while the content
slot holds its loading frame. A session older than the published revision holds no decision
on it: the gate and workspace setup sign the person out (which ends every
session of theirs, all of which predate the revision) and send them to sign in
with a notice (`/login?error=terms_changed`), where signing in takes the
decision. A revision republished between the gate's read and its record is
re-read, not treated as a missing decision; a sign-in or sign-up form that names
a superseded revision is refused (409) and re-reads the published one. The chooser and workspace setup never wait on the selected
workspace's Terms or access. PostgreSQL stores
actor, workspace, immutable revision, context and timestamp; repeated acceptance
of one revision is idempotent. Updating the approved Terms revision requires
renewed acceptance and never overwrites an earlier row. Privacy is a notice;
optional analytics consent remains separate. The approved revision registry is
`frontend/services/api/src/config/auth-runtime.json`; internal proposals never enter it.
Signed enterprise-agreement references are separate append-only records. A
platform administrator records one with `agreement:record` (preview by default;
`src/cli/enterprise-agreement.ts`) after verifying signature and authority
against the contract archive. The signatory must be an active Owner/Admin of
that workspace. Repeating the same evidence is inert; conflicting evidence is
refused. This records no contract
body, changes no commercial terms, and does not substitute for ordinary user
acceptance. Checkout-linked acceptance remains a later payment workstream.

The shared security-event writer appends membership join, role change, removal,
departure and ownership-transfer receipts in the mutation transaction. A
rollback removes its receipt; repeated unchanged roles emit nothing. Google
sign-in and customer provider-credential mutations also use this bounded
writer. Event records contain identifiers and event kinds, never request
bodies, provider credentials or prompts. Security events are kept for 30 days
(`ABUSE_SECURITY_EVENT_RETENTION_DAYS`): the runner's periodic
`security-event-retention` owner deletes older rows in bounded batches
(`ABUSE_SECURITY_EVENT_PRUNE_BATCH`), so the log is a recent audit trail, not an
archive. Retention must stay longer than `signup_notice_window_seconds`, whose
`auth.signup_notified` marker stops a repeat notice.

[Workspace APIs](../frontend/services/api/src/routes/workspaces.ts) use the
[workspace owner](../frontend/services/api/src/workspaces/) for invitations,
acceptance, role changes, removal and ownership transfer. Invitation tokens are
hashed, expiring and single-use; acceptance requires the matching authenticated
identity. Admitting people needs the plan's `team_members` entitlement, which
trials do not carry: issuing, resending and accepting an invitation are refused
without it (revoking never is), so a trial workspace is its Owner alone. Repeated acceptance is inert. Owner is not an assignable invitation
role. Transfer installs a replacement atomically, and removal, demotion or
departure cannot leave a workspace ownerless. Only the Owner can transfer
ownership, and only to a member who owns no workspace. Removal or departure also
drops the workspace from that person's MCP grants, so a later re-invitation needs
fresh MCP consent, and revokes the API keys that person created in the workspace
(`creator_removed`). Removal, departure, or a demotion to a role that cannot
manage members also revokes the pending invitations that person issued, so a
link they sent cannot restore access after the change; resending a link makes
the resender its issuer. Acceptance also requires the issuer to be active and
still able to manage members. An [API key](public-api.md) acts for its creator: its
scopes intersect the creator's current role on every request, so a demotion
narrows it at once, a disabled or unverified creator stops it, and only Owners
and Admins (`manage_credentials`) create or revoke keys.
Workspace-root locks serialize membership and invitation changes; mutations
recheck live authority after taking the lock. Creation and incoming ownership
share the per-user creation advisory lock. Terms reads never repair state.

Invitation issuance commits before bounded Resend delivery. Provider acceptance
is distinct from inbox delivery; the one-time copy-link fallback remains usable
after mail failure. Resend rotates the token. Auth continuation permits only
reconstructed invitation and MCP paths; Google keeps invitation secrets in an
encrypted transaction-bound browser cookie, outside provider-visible state.

Verification and password reset use purpose-bound SHA-256 token digests, atomic
single consumption and bounded request/send budgets. Links carry tokens in the
fragment; GET never consumes them. Verification requires the signup password.
Reset replaces the password, may verify a pending mailbox, invalidates outstanding
challenges and revokes sessions. Reset, password change and an operator password
reset also revoke the person's MCP grants, end their unexchanged MCP
authorization codes and revoke the API keys they created
(`credential_reset`), so recovering an account removes delegated access a
compromised password may have minted; key creation and MCP consent lock the
person's row and recheck its session version, so a key or code minted in flight
cannot slip past that revocation. Password change requires the current password;
signing out revokes every session (sign-out is always everywhere) and leaves MCP
grants and API keys working. A separate, confirmed "Sign out everywhere and
disconnect integrations" control (`POST /api/v1/auth/logout-and-disconnect`)
also revokes the person's MCP grants and unexchanged codes and the API keys they created in the same
transaction, recording `auth.logout_disconnect`. Mail is request-bounded, not a durable queue:
a crash after commit is recovered by requesting a new link after cooldown.
Eligible and ineligible recipients share the configured `AUTH_MAIL_TIMEOUT_MS`
response wait budget (default 5000 ms), so provider latency does not reveal
mailbox eligibility. Delivery completes within the request; it is not detached
onto CPU that might be suspended after the response.

Product REST, MCP and execution boundaries resolve persisted workspace access
at the current time. Expiry preserves data while allowing account security,
minimal membership/access discovery, Terms, invitation acceptance and switching
to another workspace. The shell blocks product content and clears product caches
when access ends. Missing access authority is distinct from an expired trial.

## Project deletion and trial retention

Deleting a project needs both the `delete_projects` role capability (Owner or
Admin) and the plan's `project_deletion` entitlement, which trials do not carry.
It removes the project and everything it owns, including its brand discoveries. Billing and usage records stay
and keep the exact IDs of the deleted audits, crawls and Agent runs; those
provenance columns carry no foreign key, so deletion never rewrites them. Deletion
is refused (`project_work_running`) while an audit, crawl, Agent run or Keyword
Research analysis still holds reserved units, because nothing could release that
hold afterwards.

A trial-only workspace (no plan, add-on, top-up or operator grant) loses access
when its trial ends. The runner deletes its projects, and any brand discovery
that never produced a project together with its tasks,
`BILLING_TRIAL_DATA_RETENTION_DAYS` (default 30) after that, a bounded batch of
workspaces per pass (`BILLING_TRIAL_PURGE_WORKSPACE_BATCH`). Each deletion holds
the project and account-capacity locks and rechecks access, so a grant issued or
work reserved before it wins; a workspace still holding reserved units is skipped
without taking a batch slot.

## Browser selection and reads

One authenticated layout owns session, project/workspace context and entitlement
provider lifetime across app and onboarding routes.
Before session identity resolves, the layout shows only the path's first frame
(neutral shell geometry on a shell route, the plain ground on a flow route).
Cold-load bootstrap settles workspace access alongside projects and entitlements.
A pending access or Terms check holds the content slot at its loading frame
(the page skeleton in the shell, the plain ground on a flow route) without
unmounting the tree above it, so a workspace switch keeps the shell and its
reads; product content renders only once both gates answer. Workspace
recovery controls appear only once the check settles without access.
After authentication, the real shell mounts once and project/entitlement gates
resolve inside its content pane, leaving account and workspace recovery
available. A non-401 session read failure keeps protected content unmounted and
offers an exact `auth.me` retry inside the caller-provided neutral shell
geometry; only a confirmed 401 clears session state and redirects to sign-in.
[Project context](../frontend/lib/project/project-context.tsx) and
[selection](../frontend/lib/project/selection.ts) resolve an explicit project
directly. Otherwise explicit workspace selection wins, then session/device
selection, then the first membership. Device storage is convenience, never
authorization. Conflicting project/workspace URL parameters are rejected.
The workspace's project list carries summaries (id, name, brand name, website
and logo), only what the switcher and other pickers show; the active project's
full view is always its own detail read, which authorizes it from the path and
is accepted only when it belongs to the resolved workspace. The switcher asks
for a project's view while its row is highlighted, so a switch rarely waits on
it. The same round as the session read asks for the addressed or remembered
workspace's access, entitlement, Terms status and project list, and for the
addressed or remembered project's detail, shell and screen reads. A project
that turns out to belong to another workspace has its unanswered reads
withdrawn before its own workspace's reads start.

Project lists, provider state, usage and entitlements carry workspace identity
in both query key and request. Late responses cannot answer for a workspace
the user has left. [Project destination](../frontend/lib/navigation/project-destination.ts)
owns push/replace/no-op history rules. Onboarding seeds the committed project
detail and enters that exact project as soon as completion commits it.
Every project-owned link carries `?project=` when the selection is known; Settings
remains workspace-owned. A bare post-login URL is only a bootstrap state and is
replaced with the resolved project URL. Every additional-project entry point carries
its workspace.

Login enters the workspace chooser; the application gate then decides whether
onboarding is appropriate. A person with no workspace is sent to set one up from
any project route, and may still reach Settings → Account and an invitation
link. An empty workspace retains access to billing/members/settings. Viewers are
offered no project editing, creation or deletion controls.
Failed reads are retryable errors, not empty lists or exhausted allowances.
The app `/pricing` continuation is workspace-only
([billing](billing-entitlements.md#read-and-ui-surfaces)).

## Dependencies

[Billing](billing-entitlements.md) resolves exactly one account per workspace.
[MCP](mcp.md) rechecks current memberships for account-bound grants.
[Onboarding](onboarding.md) creates projects subject to role and occupancy.
Accepted rationale is in [decisions](decisions.md).

## Operator account management

`node scripts/provision-dev-login.mjs` (historical filename) is the interactive
**production** entry point: it opens the IAP tunnel and prompts for the
operator's password without echo, since production keeps no operator password
secret (BL9). No password is passed on argv or saved to disk. Its platform menu
administers customer identities; customer identities retain platform role `user`; workspace Owner/Admin never
becomes platform administration. Existing identities are not overwritten by
batch creation. Each mutation previews the real transaction and rolls back,
then rechecks authenticated platform authority after explicit confirmation.
Batch identity, membership and access writes commit atomically.

Every new owned workspace receives the operator baseline grant. Full
evaluation access is an optional extra bundle that grants all issuable capabilities, highest feature levels,
and a prompted finite counter allowance (defaulting to configured development
allowance), with optional expiry. It uses one append-only bundle per target
workspace, not one transaction per capability or duplicate bundles per member.
The configured dev-only rollout/funding restrictions still apply. Reasons and
stable request keys accompany operator changes. Grants can be revoked by exact ID.

Deletion is a terminal choice: disable login and revoke sessions while retaining
records, or permanently delete an unused operator-created customer account.
Permanent deletion refuses retained FK dependencies, any grant beyond the
operator baseline, consumption, product data and shared owned workspaces; it
removes only the identity and its empty personal workspace, account and baseline
rows. Security receipts remain. Platform administrators and the current operator
cannot have their password reset, or be disabled or deleted, by this menu. The
workspace CLI's password reset likewise refuses the workspace Owner, the
operator themself, any platform administrator and anyone who also belongs to
another workspace, because a password is global; it records
`auth.password_reset`.

The interactive
[account manager](../frontend/services/api/src/cli/account-manager.ts)
(`pnpm --filter @citeladder/api account:manage --actor <email> --workspace-id <uuid>`)
requires an active Owner or Admin of the explicit target workspace; it issues no
grants and sets no project or prompt limits, and shows invitation tokens once.
Against production, use the IAP tunnel from the
[GCP runbook](operations/GCP_RUNBOOK.md#3-daily-operation).

The native account manager locks the workspace root before actor/target membership
rows and user password updates. It rechecks active membership, the authenticated
password hash and session version after confirmation and between choices; prompts
hold no database locks. Invitation issuance and assignable role changes use the
same owners as the workspace API. Creating an invited identity, or an
identity that joins an existing workspace, creates no workspace for it: the
person owns none until they create their own.
Identity provisioning and the invitation commit atomically. Password resets increment
the session version; resetting the operator's own password requires a new login.
Bounded identity operators share a transaction advisory lock before taking row
locks. This preserves agreement recording's actor → workspace → member order
and account management's workspace → membership → user order without lock
inversion, including password resets across workspaces. Terminal prompts never
hold this lock.
