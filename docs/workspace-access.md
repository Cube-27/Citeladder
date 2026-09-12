# Workspace and project access

## Responsibility

A User is an authenticated identity; a Workspace is the product-data and billing
boundary; a Project belongs to one workspace. A user owns one workspace and may
join others by invitation. One designated Owner must remain in each workspace.
The designation is distinct from platform/operator administration.

## Authentication and authorization

[Auth API](../backend/app/api/auth.py) and
[auth service](../backend/app/domain/auth/service.py) own session establishment.
Registration returns a generic acknowledgement rather than a session.
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

## Dependencies and evidence

[Billing](billing-entitlements.md) resolves exactly one account per workspace.
[MCP](mcp.md) rechecks current memberships for account-bound grants.
[Onboarding](onboarding.md) creates projects subject to role and occupancy.
The [role tests](../backend/tests/component/test_workspace_roles.py) and
[workspace authorization tests](../backend/tests/unit/test_workspace_auth.py)
cover the central boundaries. Accepted rationale is in
[decisions](decisions.md); the retained shell plan tracks only remaining work.
