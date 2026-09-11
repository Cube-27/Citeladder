"""The ONE workspace role/capability policy (plan §2.3).

Four roles, one static matrix, stated here once. Every entry point that can
perform a workspace action — API dependencies, the MCP server, services and
workers — resolves permission through :func:`role_allows` rather than
re-spelling a role set of its own. A second matrix somewhere else is the
defect this module exists to prevent.

Role authorization is deliberately separate from entitlements: a role decides
whether an action is *permitted*, the workspace's capabilities and remaining
allowance decide whether it is *available*. Both must say yes.

Workspace Admin is not platform/operator admin: it confers nothing global,
cross-workspace, or catalog/secret related.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Final

WORKSPACE_ROLE_OWNER: Final = "owner"
WORKSPACE_ROLE_ADMIN: Final = "admin"
WORKSPACE_ROLE_MEMBER: Final = "member"
WORKSPACE_ROLE_VIEWER: Final = "viewer"

#: Every role a ``WorkspaceMember.role`` may hold. An unknown value is never
#: silently treated as a known one — it authorizes nothing.
WORKSPACE_ROLES: Final = (
    WORKSPACE_ROLE_OWNER,
    WORKSPACE_ROLE_ADMIN,
    WORKSPACE_ROLE_MEMBER,
    WORKSPACE_ROLE_VIEWER,
)

#: Roles an invitation or a role change may name. ``owner`` is excluded: the
#: single designated Owner changes only through an ownership transfer, which
#: installs the replacement in the same transaction.
ASSIGNABLE_WORKSPACE_ROLES: Final = (
    WORKSPACE_ROLE_ADMIN,
    WORKSPACE_ROLE_MEMBER,
    WORKSPACE_ROLE_VIEWER,
)


class WorkspaceCapability(StrEnum):
    """What a role may do inside one workspace."""

    #: Read non-administrative workspace/project data, including downloading an
    #: already-generated report. Every role has it.
    READ = "read"
    #: Create/edit/delete projects, manage prompts, configure product features.
    WRITE = "write"
    #: Start audits, crawls, generation and other product work. Initiating new
    #: generated work is never a read, however it is spelled over HTTP.
    RUN = "run"
    #: Billing, invoices, payment settings and purchase intents.
    MANAGE_BILLING = "manage_billing"
    #: Invite/remove members, change roles, transfer ownership.
    MANAGE_MEMBERS = "manage_members"
    #: Provider/integration credentials. Administrative alongside billing and
    #: member management (owner decision, 11 September 2026) — never Member.
    MANAGE_CREDENTIALS = "manage_credentials"


_ADMINISTRATIVE: Final = frozenset(
    {
        WorkspaceCapability.MANAGE_BILLING,
        WorkspaceCapability.MANAGE_MEMBERS,
        WorkspaceCapability.MANAGE_CREDENTIALS,
    }
)
_PRODUCT: Final = frozenset(
    {
        WorkspaceCapability.READ,
        WorkspaceCapability.WRITE,
        WorkspaceCapability.RUN,
    }
)

# Owner and Admin are deliberately IDENTICAL in permissions. Owner is a
# continuity designation, not an extra privilege level: both may initiate an
# ownership transfer, and neither may leave the workspace ownerless.
_MATRIX: Final[dict[str, frozenset[WorkspaceCapability]]] = {
    WORKSPACE_ROLE_OWNER: _PRODUCT | _ADMINISTRATIVE,
    WORKSPACE_ROLE_ADMIN: _PRODUCT | _ADMINISTRATIVE,
    WORKSPACE_ROLE_MEMBER: _PRODUCT,
    WORKSPACE_ROLE_VIEWER: frozenset({WorkspaceCapability.READ}),
}


def role_capabilities(role: str) -> frozenset[WorkspaceCapability]:
    """Every capability ``role`` confers. An unknown role confers none."""
    return _MATRIX.get(role, frozenset())


def role_allows(role: str, capability: WorkspaceCapability) -> bool:
    """Whether ``role`` may perform ``capability`` (fail-closed)."""
    return capability in role_capabilities(role)


def is_workspace_administrator(role: str) -> bool:
    """Whether ``role`` holds the administrative capabilities (Owner/Admin)."""
    return _ADMINISTRATIVE <= role_capabilities(role)


def effective_capabilities(role: str) -> tuple[str, ...]:
    """The role's capabilities as a stable, safe list for frontend controls.

    Safe by construction: capability names only, never a billing profile, a
    provider reference, or another member's identity. Hiding a control is a
    convenience — the server still enforces every denial itself.
    """
    return tuple(sorted(capability.value for capability in role_capabilities(role)))


def roles_with(capability: WorkspaceCapability) -> tuple[str, ...]:
    """Every role conferring ``capability``, in the canonical role order."""
    return tuple(role for role in WORKSPACE_ROLES if role_allows(role, capability))


__all__ = [
    "ASSIGNABLE_WORKSPACE_ROLES",
    "WORKSPACE_ROLES",
    "WORKSPACE_ROLE_ADMIN",
    "WORKSPACE_ROLE_MEMBER",
    "WORKSPACE_ROLE_OWNER",
    "WORKSPACE_ROLE_VIEWER",
    "WorkspaceCapability",
    "effective_capabilities",
    "is_workspace_administrator",
    "role_allows",
    "role_capabilities",
    "roles_with",
]
