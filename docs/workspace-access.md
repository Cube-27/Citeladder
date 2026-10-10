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
until mailbox verification; legacy/operator identities retain their explicit
access policy without invented verification timestamps. Google sign-in is gated
by `OAUTH_GOOGLE_ENABLED`; new Google identities also require `PUBLIC_SIGNUP_ENABLED`.
Email/password login and Google sign-in establish the HttpOnly session;
session-version checks invalidate stale sessions. The frontend crosses the
identity boundary with full-document navigation so a prefetched anonymous
layout cannot be reused.

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
password verification or provider I/O; successful credentials bypass email
failure budgets.

[TypeScript authorization](../frontend/services/api/src/auth/workspace.ts) resolves
membership and exposes safe capabilities. Flat APIs use an explicit workspace header or the user's
default membership. A project-detail or image request can resolve membership
through its project ID, but never trusts that ID alone. Foreign/missing objects
do not reveal product data.

The [native role policy](../frontend/services/api/src/config/workspaces.json)
owns the authorization matrix:

| Role          | Product read | Product write/run | Billing, members, credentials |
| ------------- | ------------ | ----------------- | ----------------------------- |
| Owner / Admin | Yes          | Yes               | Yes                           |
| Member        | Yes          | Yes               | No                            |
| Viewer        | Yes          | No                | No                            |

Unknown roles fail closed. Role authorization and entitlement availability are
separate checks; both must permit an action. Workspace Admin is not an operator
authorized to publish the global billing catalog or administer other workspaces.

## Membership and ownership continuity

Authenticated onboarding reads `/workspaces/{id}/policies` and records an
explicit Terms acceptance before opening that workspace in the app. This covers
password, Google-created and operator-created identities. The decision is taken
on the sign-in form (an unticked, required checkbox for both email and Google
sign-in) and recorded for the resolved workspace against the server-published
revision; a session that reaches the app without that decision in the same tab
gets the explicit review screen instead. PostgreSQL stores
actor, workspace, immutable revision, context and timestamp; repeated acceptance
of one revision is idempotent. Updating the approved Terms revision requires
renewed acceptance and never overwrites an earlier row. Privacy is a notice;
optional analytics consent remains separate. The approved revision registry is
`frontend/services/api/src/config/auth-runtime.json`; internal proposals never enter it.
Signed enterprise-agreement references are separate append-only records. A
platform administrator pipes local reference JSON into `pnpm --filter
@citeladder/api agreement:record --actor <admin-email>` from `frontend/`; the command
rolls back unless `--apply` is supplied. The JSON names `workspace_id`,
`signatory_id`, an opaque `reference`, `document_sha256`, timezone-aware
`signed_at`, and `authority_verified: true`. The operator must verify the
signature and authority against the contract archive first. The signatory must
be an active Owner/Admin of that workspace. Repeating the same reference and
evidence is inert; conflicting evidence is refused. This records no contract
body, changes no commercial terms, and does not substitute for ordinary user
acceptance. Checkout-linked acceptance remains a later payment workstream.

The shared security-event writer appends membership join, role change, removal,
departure and ownership-transfer receipts in the mutation transaction. A
rollback removes its receipt; repeated unchanged roles emit nothing. Google
sign-in and customer provider-credential mutations also use this bounded
writer. Event records contain identifiers and event kinds, never request
bodies, provider credentials or prompts.

[Workspace APIs](../frontend/services/api/src/routes/workspaces.ts) use the
[workspace owner](../frontend/services/api/src/workspaces/) for invitations,
acceptance, role changes, removal and ownership transfer. Invitation tokens are
hashed, expiring and single-use; acceptance requires the matching authenticated
identity. Repeated acceptance is inert. Owner is not an assignable invitation
role. Transfer installs a replacement atomically, and removal, demotion or
departure cannot leave a workspace ownerless. Owned-workspace limits count
ownership rather than invited memberships, including ownership transfer.
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
challenges and revokes sessions. Password change requires the current password;
logout and explicit sign-out-all revoke every session. Account security reports
actual methods and verification state inline in Settings → Account, with compact
password, Google-linking and session controls. The blocked-access screen opens
the same controls in a recovery dialog. Mail is request-bounded, not a durable queue:
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

## Browser selection and reads

One authenticated layout owns session, project/workspace context and entitlement
provider lifetime across app and onboarding routes.
Before session identity resolves, the layout shows only neutral shell geometry.
Cold-load bootstrap settles workspace access alongside projects and entitlements.
A pending access check retains the neutral loading frame; workspace recovery
controls appear only once the check settles without access.
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

Project lists, provider state, usage and entitlements carry workspace identity
in both query key and request. Late responses cannot answer for a workspace
the user has left. [Project destination](../frontend/lib/navigation/project-destination.ts)
owns push/replace/no-op history rules. Onboarding seeds the committed project
detail and enters that exact project as soon as completion commits it.
Every project-owned link carries `?project=` when the selection is known; Settings
remains workspace-owned. A bare post-login URL is only a bootstrap state and is
replaced with the resolved project URL. Every additional-project entry point carries
its workspace.
Project creation refreshes the workspace allowance before another creation
action can become available. Additional-project entry points stay disabled
while allowance is unresolved or no project slots remain, including after a
trial account creates its first project.

Login enters Overview; the application gate decides whether onboarding is
appropriate. An empty workspace retains access to billing/members/settings.
Failed reads are retryable errors, not empty lists or exhausted allowances.
The app `/pricing` continuation is also workspace-only: it resolves the
selected workspace without requiring a project, and only Owner/Admin billing
capability can start a purchase. Its selection URL is captured before the
sign-in redirect; the server still authorizes every billing mutation.

## Dependencies and evidence

[Billing](billing-entitlements.md) resolves exactly one account per workspace.
[MCP](mcp.md) rechecks current memberships for account-bound grants.
[Onboarding](onboarding.md) creates projects subject to role and occupancy.
The [workspace tests](../frontend/services/api/test/workspaces.test.ts),
[auth tests](../frontend/services/api/test/auth-routes.test.ts) and
[workspace authorization tests](../frontend/services/api/test/workspace-scope.test.ts)
cover the central boundaries. Accepted rationale is in
[decisions](decisions.md); the retained shell plan tracks only remaining work.

## Operator account management

The existing `scripts/provision-dev-login.ps1` is the interactive **production**
entry point (its historical filename is retained). Run it from the repository root:

```powershell
./scripts/provision-dev-login.ps1
```

It uses the active `gcloud` login to verify the database instance against the
database secret, authenticate SSH, open a loopback IAP tunnel, and load the
configured development operator password into process memory. It restores the
calling shell's environment and closes only its own tunnel on exit. A first
connection may ask gcloud's SSH host-key trust question. With a tunnel already
open, use `-UseExistingTunnel -LocalPort 15432`. Project, instance, zone, secret
names and actor can be selected explicitly; a custom actor is prompted for a
password without echo. No password is passed on argv or saved to disk.

The platform menu lists identities/workspaces, creates batches of customer
accounts with owned workspaces or immediate assignable memberships in an
existing workspace, changes roles, resets passwords, grants/revokes evaluation
access, removes members, and enables/disables or permanently deletes accounts.
Customer identities retain platform role `user`; workspace Owner/Admin never
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
cannot have their password reset, or be disabled or deleted, by this menu.

Trusted workspace operators can run the interactive
[account manager](../frontend/services/api/src/cli/account-manager.ts) from a terminal
with Node 26 and installed frontend dependencies (or the native API image).
It requires an active Owner or Admin of the explicit target workspace. It lists
members, creates or invites a user, changes
an existing member's assignable role, and resets a member's password while
invalidating existing sessions. Invitation tokens are shown once for secure
delivery to the invitee; the invitee accepts while signed in. The tool does not
issue grants or set project or prompt limits.

```bash
cd frontend
pnpm --filter @citeladder/api account:manage \
  --actor <workspace-owner-or-admin-email> --workspace-id <workspace-uuid>
```

Against production, open the IAP database tunnel from the
[GCP runbook](operations/GCP_RUNBOOK.md#3-daily-operation) and run the same
command from `frontend/` with `DATABASE_URL` pointing at `127.0.0.1:15432`.

Passwords are prompted without echo and are never command-line arguments.

The native account manager locks the workspace root before actor/target membership
rows and user password updates. It rechecks active membership, the authenticated
password hash and session version after confirmation and between choices; prompts
hold no database locks. Invitation issuance and assignable role changes use the
same owners as the workspace API. Creating an invited identity preserves its
personal workspace and billing account bootstrap without issuing signup grants.
Identity provisioning and the invitation commit atomically. Password resets increment
the session version; resetting the operator's own password requires a new login.
Bounded identity operators share a transaction advisory lock before taking row
locks. This preserves agreement recording's actor → workspace → member order
and account management's workspace → membership → user order without lock
inversion, including password resets across workspaces. Terminal prompts never
hold this lock.

The native workspace config owns the role matrix. Native PostgreSQL tests cover
authorization, replay, revocation, rollback and workspace isolation, including
the schema's composite workspace keys. The SQL schema baseline owns the schema.
