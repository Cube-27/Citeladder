# Shared literal constants for ORM model definitions.
#
# Deduplicates the SQLAlchemy ``ForeignKey`` target and ondelete/cascade strings
# repeated across the model modules. Every value is byte-identical to the inline
# literal it replaces — this is a readability refactor with NO schema or runtime
# behavior change.
from __future__ import annotations

# ForeignKey targets, repeated wherever a model hangs off one of these tables.
FK_AUDITS_ID = "audits.id"
FK_PROVIDER_CONNECTIONS_ID = "provider_connections.id"
FK_USERS_ID = "users.id"
FK_WORKSPACES_ID = "workspaces.id"
FK_PROJECTS_ID = "projects.id"
FK_MCP_OAUTH_CLIENTS_CLIENT_ID = "mcp_oauth_clients.client_id"
FK_TRAFFIC_SNAPSHOTS_WORKSPACE_ID = "traffic_snapshots.workspace_id"

# ``ondelete`` policy: null out the child FK when the parent row is removed.
ON_DELETE_SET_NULL = "SET NULL"

# ``relationship(cascade=...)`` policy: cascade all ops and delete orphaned rows.
CASCADE_ALL_DELETE_ORPHAN = "all, delete-orphan"
