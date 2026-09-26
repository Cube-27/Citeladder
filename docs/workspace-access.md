# Workspace and project access

## Responsibility

A User is an authenticated identity; a Workspace is the product-data and billing
boundary; a Project belongs to one workspace. A user owns one workspace and may
join others by invitation. One designated Owner must remain in each workspace.
The designation is distinct from platform/operator administration.

## Authentication and authorization

[Auth API](../backend/app/api/auth.py) and
[auth service](../backend/app/domain/auth/service.py) own session establishment.
Registration returns a generic acknowledgement rather than a session, and is
refused unless `PUBLIC_SIGNUP_ENABLED` is set; operators otherwise create
accounts with `backend/scripts/account_manager.py`. Google sign-in, which
creates an account on first use, is separately gated by `OAUTH_GOOGLE_ENABLED`.
Email/password login and Google sign-in establish the HttpOnly session;
session-version checks invalidate stale sessions. The frontend crosses the
identity boundary with full-document navigation so a prefetched anonymous
layout cannot be reused.

[API dependencies](../backend/app/api/deps.py) resolve membership and expose
safe capabilities. Flat APIs use an explicit workspace header or the user's
default membership. A project-detail or image request can resolve membership
through its project ID, but never trusts that ID alone. Foreign/missing objects
do not reveal product data.

The [role policy](../backend/app/domain/workspaces/policy.py) is the sole matrix:

| Role | Product read | Product write/run | Billing, members, credentials |
|---|---|---|---|
| Owner / Admin | Yes | Yes | Yes |
| Member | Yes | Yes | No |
| Viewer | Yes | No | No |

Unknown roles fail closed. Role authorization and entitlement availability are
separate checks; both must permit an action. Workspace Admin is not an operator
authorized to publish the global billing catalog or administer other workspaces.

## Membership and ownership continuity

Authenticated onboarding reads `/workspaces/{id}/policies` and captures an
explicit Terms acceptance before opening that workspace in the app. This covers
password, Google-created and operator-created identities. PostgreSQL stores
actor, workspace, immutable revision, context and timestamp; repeated acceptance
of one revision is idempotent. Updating the approved Terms revision requires
renewed acceptance and never overwrites an earlier row. Privacy is a notice;
optional analytics consent remains separate. The approved revision registry is
`backend/app/core/config/legal.py`; internal proposals never enter it.
Signed enterprise-agreement references are separate append-only records. A
platform administrator uses `uv run python -m scripts.enterprise_agreement
--actor <admin-email> --input <local-json-file>` from `backend/`; the command
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

[Workspace APIs](../backend/app/api/workspaces.py) use the
[workspace domain](../backend/app/domain/workspaces/) for invitations,
acceptance, role changes, removal and ownership transfer. Invitation tokens are
hashed, expiring and single-use; acceptance requires the matching authenticated
identity. Repeated acceptance is inert. Owner is not an assignable invitation
role. Transfer installs a replacement atomically, and removal, demotion or
departure cannot leave a workspace ownerless. Owned-workspace limits count
ownership rather than invited memberships.

Invitation records exist, but there is no mail transport owner. Multi-workspace
selection at sign-in remains deferred; neither limitation is a claim that the
membership model itself is absent.

## Browser selection and reads

One authenticated layout owns session, project/workspace context and entitlement
provider lifetime across app and onboarding routes.
Before session identity resolves, the layout shows only neutral shell geometry.
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
detail and enters that exact project without waiting for portfolio generation.
Every project-owned link carries `?project=` when the selection is known; Settings
remains workspace-owned. A bare post-login URL is only a bootstrap state and is
replaced with the resolved project URL. Every additional-project entry point carries
its workspace.

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
The [role tests](../backend/tests/component/test_workspace_roles.py) and
[workspace authorization tests](../backend/tests/unit/test_workspace_auth.py)
cover the central boundaries. Accepted rationale is in
[decisions](decisions.md); the retained shell plan tracks only remaining work.

## Operator account management

Trusted workspace operators can run the interactive
[account manager](../backend/scripts/account_manager.py) from a backend terminal.
It requires an active Owner or Admin of the explicit target workspace. It lists
members, creates or invites a user, changes
an existing member's assignable role, and resets a member's password while
invalidating existing sessions. Invitation tokens are shown once for secure
delivery to the invitee; the invitee accepts while signed in. The tool does not
issue grants or set project or prompt limits.

```bash
cd backend
uv run python -m scripts.account_manager \
  --actor <workspace-owner-or-admin-email> --workspace-id <workspace-uuid>
```

After deploying an image that includes the script, run it on the GCP VM with
the backend container's interactive terminal:

```bash
sudo docker compose --env-file /opt/citeladder/runtime.env \
  -f /opt/citeladder/compose.gcp.yml exec web \
  python -m scripts.account_manager \
  --actor kerry@citeladder.com \
  --workspace-id fe2ce60f-906d-4285-afd6-17b5ea51e510
```

Passwords are prompted without echo and are never command-line arguments.
