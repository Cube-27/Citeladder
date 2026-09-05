"""Remote Streamable HTTP MCP server mounted into the CiteLadder ASGI app."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from html import escape
from typing import Any
from urllib.parse import quote, urlsplit

from mcp.server import MCPServer
from mcp.server.auth import routes as auth_routes
from mcp.server.auth.settings import (
    AuthSettings,
    ClientRegistrationOptions,
    RevocationOptions,
)
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import demo_access_expired, settings
from app.core.config.mcp import MCP_READ_SCOPE, MCP_SERVER_VERSION, mcp_settings
from app.core.database import SessionLocal
from app.domain.auth.service import resolve_session_user
from app.domain.mcp.data import (
    fetch_business_record,
    list_account_projects,
    project_business_context,
    read_growth_evidence,
    search_business_context,
    skill_catalog,
)
from app.domain.mcp.oauth_provider import (
    CiteLadderOAuthProvider,
    PendingAuthorization,
    consent_csrf_token,
    consent_csrf_valid,
    public_base_url,
)
from app.models.user import User

_READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)


def _startup_origin() -> str:
    """Resolve the public origin without letting a disabled MCP break startup.

    ``public_base_url`` fails closed on an unsafe origin, and that check has to
    keep biting whenever MCP is enabled. But this module is imported by the ASGI
    app factory, so with MCP off a misconfigured origin would take ``/health``
    and every other route down with it. Off and misconfigured degrades to an
    unroutable placeholder; on still raises.
    """
    try:
        return public_base_url()
    except RuntimeError:
        if mcp_settings.enabled:
            raise
        return "http://mcp-disabled.invalid"


_STARTUP_ORIGIN = _startup_origin()
_CONSENT_PATH = "/mcp/oauth/consent"

# The SDK hardcodes RFC 7591 dynamic client registration at /register, which
# collides with the frontend's signup page: Caddy sends the shared path to the
# backend and every GET /register 405s. Rebinding the SDK's module constant
# before the ASGI app is built moves the route and the advertised
# registration_endpoint together -- build_metadata reads this global when
# streamable_http_app() runs below, so the discovery document cannot drift from
# the route that serves it.
MCP_REGISTRATION_PATH = "/mcp/register"
auth_routes.REGISTRATION_PATH = MCP_REGISTRATION_PATH

mcp_oauth_provider = CiteLadderOAuthProvider()
mcp_server = MCPServer(
    name="citeladder",
    title="CiteLadder Business Context",
    description="Read-only, account-scoped growth intelligence from CiteLadder.",
    instructions=(
        "This server is read-only. Begin with list_projects when no project "
        "ID is known. Use get_project_business_context for a complete persisted "
        "overview, then use search and fetch for specific evidence. Missing "
        "evidence is reported as unavailable and must not be interpreted as "
        "zero. Never claim that CiteLadder data proves causation."
    ),
    website_url=f"{_STARTUP_ORIGIN}/docs/mcp",
    version=MCP_SERVER_VERSION,
    auth_server_provider=mcp_oauth_provider,
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(_STARTUP_ORIGIN),
        resource_server_url=AnyHttpUrl(f"{_STARTUP_ORIGIN}/mcp"),
        service_documentation_url=AnyHttpUrl(f"{_STARTUP_ORIGIN}/docs/mcp"),
        required_scopes=[MCP_READ_SCOPE],
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            client_secret_expiry_seconds=2_592_000,
            valid_scopes=[MCP_READ_SCOPE],
            default_scopes=[MCP_READ_SCOPE],
        ),
        revocation_options=RevocationOptions(enabled=True),
    ),
)


@mcp_server.tool(
    name="list_projects",
    title="List CiteLadder projects",
    description="List every project visible to the connected CiteLadder account.",
    annotations=_READ_ONLY,
)
async def list_projects() -> dict[str, Any]:
    async with SessionLocal() as session:
        return await list_account_projects(session)


@mcp_server.tool(
    name="get_project_business_context",
    title="Get complete project business context",
    description=(
        "Read the project profile, active prompt portfolio, Site Health, demand, "
        "opportunities, and latest visibility audit from persisted CiteLadder data."
    ),
    annotations=_READ_ONLY,
)
async def get_project_business_context(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await project_business_context(session, project_id)


@mcp_server.tool(
    name="search",
    title="Search CiteLadder business context",
    description=(
        "Search account-authorized projects, opportunities, and prompts. Returns "
        "stable record URIs that can be passed to fetch."
    ),
    annotations=_READ_ONLY,
)
async def search(
    query: str, project_id: str | None = None, limit: int = 10
) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await search_business_context(session, query, project_id, limit)


@mcp_server.tool(
    name="fetch",
    title="Fetch a CiteLadder record",
    description=(
        "Fetch a full account-authorized record by a citeladder:// URI returned "
        "by search."
    ),
    annotations=_READ_ONLY,
)
async def fetch(
    id: str,
) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await fetch_business_record(session, id)


def _evidence_tool(
    name: str, title: str, description: str
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def decorator(function: Callable[..., Any]) -> Callable[..., Any]:
        return mcp_server.tool(
            name=name,
            title=title,
            description=description,
            annotations=_READ_ONLY,
        )(function)

    return decorator


@_evidence_tool(
    "read_site_health",
    "Read latest Site Health",
    "Read the latest persisted Site Health score and coverage projection for "
    "a project.",
)
async def read_site_health(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(session, project_id, "site.read_snapshot")


@_evidence_tool(
    "read_demand",
    "Read latest demand intelligence",
    "Read the latest persisted demand snapshot, coverage, and comparison for "
    "a project.",
)
async def read_demand(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(session, project_id, "demand.read_snapshot")


@_evidence_tool(
    "read_opportunities",
    "Read ranked opportunities",
    "Read the highest-priority current opportunities and their persisted "
    "evidence references.",
)
async def read_opportunities(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(
            session, project_id, "opportunities.read_ranked"
        )


@_evidence_tool(
    "read_visibility_audit",
    "Read latest visibility audit",
    "Read the latest persisted AI visibility audit status, summary, and "
    "evidence reference.",
)
async def read_visibility_audit(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(session, project_id, "audits.read_latest")


@_evidence_tool(
    "read_performance",
    "Read Search Console performance",
    "Read the persisted Search Console/GA4 performance projection for a "
    "project: clicks, impressions, CTR, average position and their series "
    "for a range, with an optional comparison window. Ranges are day, week, "
    "month, 3_months, 6_months, last_synced, or custom with start_date and "
    "end_date (ISO YYYY-MM-DD).",
)
async def read_performance(
    project_id: str,
    range: str | None = None,
    granularity: str | None = None,
    compare: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    # ``start_date``/``end_date`` rather than the REST surface's from/to:
    # ``from`` is a Python keyword, so a parameter of that name cannot exist
    # here, and a trailing-underscore spelling is one a client would have to
    # guess from the signature rather than the description.
    async with SessionLocal() as session:
        return await read_growth_evidence(
            session,
            project_id,
            "performance.read_snapshot",
            {
                "range": range,
                "granularity": granularity,
                "compare": compare,
                "from": start_date,
                "to": end_date,
            },
        )


@_evidence_tool(
    "read_performance_table",
    "Read a performance breakdown",
    "Read one paged breakdown of the persisted performance projection: "
    "query, page, country, device, search_appearance, day, bing_query or "
    "bing_page. Pass the snapshot_id a performance read returned, or a range "
    "(with start_date/end_date when the range is custom) to resolve it.",
)
async def read_performance_table(
    project_id: str,
    dimension: str | None = None,
    snapshot_id: str | None = None,
    range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort: str | None = None,
    cursor: str | None = None,
) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(
            session,
            project_id,
            "performance.read_table",
            {
                "dimension": dimension,
                "snapshot_id": snapshot_id,
                "range": range,
                # Forwarded so a custom range resolves the window the caller
                # asked for; without them the resolver falls back to the
                # latest snapshot and answers a different question.
                "from": start_date,
                "to": end_date,
                "sort": sort,
                "cursor": cursor,
            },
        )


@_evidence_tool(
    "read_ai_referrals",
    "Read AI referral traffic",
    "Read the persisted AI-referral projection for a project: sessions "
    "referred by AI answer engines, their share of traffic, and the sources "
    "behind them. Pass start_date and end_date (ISO YYYY-MM-DD) for an "
    "explicit window.",
)
async def read_ai_referrals(
    project_id: str,
    range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(
            session,
            project_id,
            "referrals.read_snapshot",
            {"range": range, "from": start_date, "to": end_date},
        )


@_evidence_tool(
    "read_integration_status",
    "Read data connection status",
    "Read which providers are connected to a project, which properties are "
    "mapped, how far the history import has progressed, and how far its "
    "coverage reaches. This is the read that explains why a projection is "
    "empty.",
)
async def read_integration_status(project_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        return await read_growth_evidence(
            session, project_id, "integrations.read_status"
        )


@mcp_server.tool(
    name="list_skills",
    title="List CiteLadder skills",
    description=(
        "List the versioned content skills and bounded Growth Agent read capabilities."
    ),
    annotations=_READ_ONLY,
)
def list_skills() -> dict[str, Any]:
    return skill_catalog()


@mcp_server.resource(
    "citeladder://skills",
    name="citeladder-skills",
    title="CiteLadder skill catalog",
    description=(
        "Versioned instructions for CiteLadder content formats and agent reads."
    ),
    mime_type="application/json",
)
def skills_resource() -> str:
    return json.dumps(skill_catalog(), sort_keys=True)


@mcp_server.resource(
    "citeladder://projects/{project_id}/context",
    name="project-business-context",
    title="Project business context",
    description="Complete persisted business context for an authorized project.",
    mime_type="application/json",
)
async def project_context_resource(project_id: str) -> str:
    async with SessionLocal() as session:
        result = await project_business_context(session, project_id)
    return json.dumps(result, sort_keys=True)


@mcp_server.prompt(
    name="business_health_review",
    title="Review company growth health",
    description="Instructions for an evidence-grounded CiteLadder business review.",
)
def business_health_review(project_id: str) -> str:
    return (
        f"Use get_project_business_context for project {project_id}. Summarize "
        "what is known across Site Health, demand, opportunities, and visibility. "
        "Keep unavailable evidence distinct from observed zero, cite artifact "
        "references, and do not infer causality."
    )


async def _consent_principal(
    request: Request, transaction: str
) -> tuple[str, User] | Response:
    """Shared GET/POST preamble: a plausible transaction and a signed-in account.

    Returns the browser session token and its user, or the response that ends
    the exchange (bad request, expired demo, or a bounce through login).
    """
    if not transaction or len(transaction) > 256:
        return PlainTextResponse("Invalid MCP authorization request.", status_code=400)
    if demo_access_expired():
        return PlainTextResponse("Demo access has expired.", status_code=401)
    session_token = request.cookies.get(settings.session_cookie_name)
    async with SessionLocal() as session:
        user = (
            await resolve_session_user(session, session_token)
            if session_token
            else None
        )
    if user is None or session_token is None:
        return_path = f"{_CONSENT_PATH}?transaction={quote(transaction, safe='')}"
        return RedirectResponse(
            f"{public_base_url()}/login?return_to={quote(return_path, safe='')}",
            status_code=302,
            headers={"Cache-Control": "no-store"},
        )
    return session_token, user


def _consent_page(
    transaction: str, session_token: str, pending: PendingAuthorization
) -> Response:
    """Render the approval form. Nothing here mutates the transaction."""
    scopes = "".join(
        f"<li><code>{escape(scope)}</code></li>" for scope in pending.scopes
    )
    csrf = consent_csrf_token(session_token, transaction)
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize MCP access</title>
<style>
body {{ margin: 0; padding: 3rem 1.5rem; background: #f7f6fd; color: #16161a;
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
main {{ max-width: 32rem; margin: 0 auto; background: #fff; padding: 2rem;
  border: 1px solid #e4e4df; border-radius: 12px; }}
h1 {{ font-size: 1.25rem; margin: 0 0 1rem; }}
h2 {{ font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.04em;
  color: #6b6b72; margin: 1.5rem 0 0.5rem; }}
ul {{ margin: 0; padding-left: 1.25rem; }}
code {{ background: #f4f4f1; padding: 0.1rem 0.3rem; border-radius: 4px;
  font-size: 0.875rem; word-break: break-all; }}
button {{ margin-top: 1.75rem; width: 100%; padding: 0.75rem 1rem; border: 0;
  border-radius: 8px; background: #c15f3c; color: #fff; font: inherit;
  font-weight: 500; cursor: pointer; }}
</style>
</head>
<body>
<main>
<h1>Authorize MCP access</h1>
<p><strong>{escape(pending.client_name)}</strong> is asking for read-only access
to your CiteLadder account.</p>
<h2>Requested scopes</h2>
<ul>{scopes}</ul>
<h2>Redirects to</h2>
<p><code>{escape(pending.redirect_uri)}</code></p>
<form method="post" action="{_CONSENT_PATH}">
<input type="hidden" name="transaction" value="{escape(transaction)}">
<input type="hidden" name="csrf_token" value="{escape(csrf)}">
<button type="submit">Approve access</button>
</form>
</main>
</body>
</html>""",
        headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"},
    )


@mcp_server.custom_route(_CONSENT_PATH, methods=["GET"])
async def render_browser_authorization(request: Request) -> Response:
    """Show what is being granted. A GET never completes the transaction."""
    transaction = request.query_params.get("transaction", "")
    principal = await _consent_principal(request, transaction)
    if isinstance(principal, Response):
        return principal
    session_token, _user = principal
    pending = await mcp_oauth_provider.describe_authorization_request(transaction)
    if pending is None:
        return PlainTextResponse(
            "Authorization request is invalid or expired", status_code=403
        )
    return _consent_page(transaction, session_token, pending)


@mcp_server.custom_route(_CONSENT_PATH, methods=["POST"])
async def complete_browser_authorization(request: Request) -> Response:
    """Grant the code, but only on an explicit approval from that same session."""
    form = await request.form()
    transaction = str(form.get("transaction") or "")
    principal = await _consent_principal(request, transaction)
    if isinstance(principal, Response):
        return principal
    session_token, user = principal
    if not consent_csrf_valid(
        session_token, transaction, str(form.get("csrf_token") or "")
    ):
        return PlainTextResponse("Invalid consent token.", status_code=403)
    try:
        destination = await mcp_oauth_provider.complete_authorization(
            transaction, uuid.UUID(str(user.id))
        )
    except PermissionError as exc:
        return PlainTextResponse(str(exc), status_code=403)
    return RedirectResponse(
        destination, status_code=303, headers={"Cache-Control": "no-store"}
    )


def _transport_security() -> TransportSecuritySettings:
    parsed = urlsplit(_STARTUP_ORIGIN)
    allowed_hosts = [parsed.netloc, parsed.hostname or ""]
    if parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
        allowed_hosts.extend(["127.0.0.1:*", "localhost:*", "[::1]:*"])
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=list(dict.fromkeys(host for host in allowed_hosts if host)),
        allowed_origins=[_STARTUP_ORIGIN],
    )


mcp_app = mcp_server.streamable_http_app(
    streamable_http_path="/mcp",
    json_response=True,
    stateless_http=True,
    transport_security=_transport_security(),
)


class McpDispatchMiddleware:
    """Send only MCP/OAuth protocol paths to the SDK's authenticated ASGI app."""

    _EXACT_PATHS = frozenset(
        {
            "/mcp",
            "/mcp/",
            "/mcp/oauth/consent",
            "/authorize",
            "/token",
            MCP_REGISTRATION_PATH,
            "/revoke",
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource/mcp",
        }
    )

    def __init__(self, app: ASGIApp, protocol_app: ASGIApp) -> None:
        self._app = app
        self._protocol_app = protocol_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Checked per request, not at registration: with MCP off these paths
        # must not exist at all. Routing them to the SDK app anyway would leave
        # anonymous client registration and a live-looking OAuth discovery
        # document on every deployment that never opted in. Falling through
        # instead hands them the app's canonical 404.
        if (
            scope["type"] == "http"
            and mcp_settings.enabled
            and scope.get("path") in self._EXACT_PATHS
        ):
            await self._protocol_app(scope, receive, send)
            return
        await self._app(scope, receive, send)
