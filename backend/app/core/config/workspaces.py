"""Workspace root-allocation policy."""

from typing import Final

# A user OWNS exactly one workspace, and every workspace has exactly one
# Owner (owner decision, 11 September 2026). This bound counts ONLY owned
# memberships: a user may belong to any number of further workspaces by
# invitation without consuming their own allocation, because those workspaces
# are somebody else's tenant root and carry somebody else's billing account.
MAX_OWNED_WORKSPACES_PER_USER: Final = 1

CODE_WORKSPACE_LIMIT_EXCEEDED: Final = "workspace_limit_exceeded"

# How long an emailed workspace invitation stays acceptable.
INVITATION_TTL_HOURS: Final = 168
# Pending invitations one workspace may hold at once. Bounds invitation spam
# without introducing seat billing or a new member cap.
MAX_PENDING_INVITATIONS_PER_WORKSPACE: Final = 50

CODE_WORKSPACE_ROLE_INVALID: Final = "workspace_role_invalid"
CODE_WORKSPACE_OWNER_REQUIRED: Final = "workspace_owner_required"
CODE_INVITATION_INVALID: Final = "workspace_invitation_invalid"
CODE_INVITATION_LIMIT_EXCEEDED: Final = "workspace_invitation_limit_exceeded"
CODE_MEMBER_NOT_FOUND: Final = "workspace_member_not_found"
