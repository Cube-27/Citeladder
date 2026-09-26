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
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import demo_access_expired, settings
from app.core.config.mcp import (
    MCP_DOCUMENTATION_URL,
    MCP_READ_SCOPE,
    MCP_SERVER_VERSION,
    mcp_settings,
)
from app.core.database import SessionLocal
from app.domain.auth.service import resolve_session_user
from app.domain.mcp.data import project_business_context
from app.domain.mcp.oauth_provider import (
    CiteLadderOAuthProvider,
    PendingAuthorization,
    consent_csrf_token,
    consent_csrf_valid,
    public_base_url,
)
from app.domain.mcp.tool_registrations import register_evidence_tools
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
    website_url=MCP_DOCUMENTATION_URL,
    version=MCP_SERVER_VERSION,
    auth_server_provider=mcp_oauth_provider,
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(_STARTUP_ORIGIN),
        resource_server_url=AnyHttpUrl(f"{_STARTUP_ORIGIN}/mcp"),
        # Refuse a bearer token issued for some other resource. Set explicitly
        # because leaving it unset means False today and True in mcp 3.0 — a
        # security default that would otherwise change under us on a routine
        # dependency bump, in whichever direction the library chose.
        #
        # True is the safe answer here rather than a guess: `authorize` already
        # rejects a mismatched `resource` parameter and records the canonical
        # `resource_url()` on every authorization request whether or not the
        # client sent one, so every token this provider issues carries the
        # resource this check compares against.
        validate_token_resource=True,
        service_documentation_url=AnyHttpUrl(MCP_DOCUMENTATION_URL),
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


def _session() -> AsyncSession:
    # Resolved on every call rather than bound at registration, so the one
    # module-level factory stays the single seam for the protocol server.
    return SessionLocal()


register_evidence_tools(_evidence_tool, _session)


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
        browser_origin = settings.frontend_url.rstrip("/")
        return RedirectResponse(
            f"{browser_origin}/login?return_to={quote(return_path, safe='')}",
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
.deny {{ margin-top: 0.75rem; background: #e8e7e2; color: #2b2b30; }}
</style>
</head>
<body>
<main>
<h1>Authorize MCP access</h1>
<p><strong>{escape(pending.client_name)}</strong> is asking for read-only access
to projects available through your CiteLadder account. Project access changes
when your workspace memberships change.</p>
<h2>Requested scopes</h2>
<ul>{scopes}</ul>
<h2>Redirects to</h2>
<p><code>{escape(pending.redirect_uri)}</code></p>
<form method="post" action="{_CONSENT_PATH}">
<input type="hidden" name="transaction" value="{escape(transaction)}">
<input type="hidden" name="csrf_token" value="{escape(csrf)}">
<button type="submit" name="decision" value="approve">Approve access</button>
<button class="deny" type="submit" name="decision" value="deny">Deny access</button>
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
    decision = str(form.get("decision") or "")
    if decision not in {"approve", "deny"}:
        return PlainTextResponse("Explicit consent decision required.", status_code=403)
    try:
        if decision == "deny":
            destination = await mcp_oauth_provider.deny_authorization(transaction)
        else:
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
    browser = urlsplit(settings.frontend_url)
    allowed_hosts = [parsed.netloc, parsed.hostname or "", browser.netloc]
    allowed_origins = [_STARTUP_ORIGIN, settings.frontend_url.rstrip("/")]
    for origin in allowed_origins.copy():
        candidate = urlsplit(origin)
        default_port = 443 if candidate.scheme == "https" else 80
        if candidate.port in {None, default_port}:
            hostname = candidate.hostname or ""
            host = f"[{hostname}]" if ":" in hostname else hostname
            allowed_hosts.extend([host, f"{host}:{default_port}"])
            allowed_origins.extend(
                [
                    f"{candidate.scheme}://{host}",
                    f"{candidate.scheme}://{host}:{default_port}",
                ]
            )
    if parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
        allowed_hosts.extend(["127.0.0.1:*", "localhost:*", "[::1]:*"])
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=list(dict.fromkeys(host for host in allowed_hosts if host)),
        allowed_origins=list(dict.fromkeys(allowed_origins)),
    )


mcp_app = mcp_server.streamable_http_app(
    streamable_http_path="/mcp",
    json_response=True,
    stateless_http=True,
    transport_security=_transport_security(),
)


def _origin_identity(value: str) -> tuple[str, str, int] | None:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return None
    default_port = 443 if parsed.scheme == "https" else 80
    host = parsed.hostname
    serialized_host = f"[{host}]" if ":" in host else host
    effective_port = port or default_port
    if parsed.netloc.lower() not in {
        serialized_host,
        f"{serialized_host}:{effective_port}",
    }:
        return None
    return parsed.scheme, host, effective_port


def _mcp_origin_error(scope: Scope) -> Response | None:
    headers = {key.lower(): value for key, value in scope.get("headers", [])}
    host = headers.get(b"host", b"").decode("ascii", errors="ignore").lower()
    origin = headers.get(b"origin", b"").decode("ascii", errors="ignore")
    protocol_origin = _origin_identity(_STARTUP_ORIGIN)
    browser_origin = _origin_identity(settings.frontend_url)
    protocol_host = _origin_identity(f"{urlsplit(_STARTUP_ORIGIN).scheme}://{host}")
    browser_host = _origin_identity(
        f"{urlsplit(settings.frontend_url).scheme}://{host}"
    )
    consent = scope.get("path") == _CONSENT_PATH
    if (
        consent
        and protocol_host == protocol_origin
        and browser_origin != protocol_origin
        and scope.get("method") == "POST"
    ):
        return PlainTextResponse(
            "Consent moved. Restart the MCP authorization request.",
            status_code=409,
            headers={"Cache-Control": "no-store"},
        )
    allowed_host = browser_host if consent else protocol_host
    allowed_origin = browser_origin if consent else protocol_origin
    if (
        allowed_origin is None
        or allowed_host != allowed_origin
        or (origin and _origin_identity(origin) != allowed_origin)
    ):
        return PlainTextResponse("Invalid MCP request origin.", status_code=403)
    return None


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
            error = _mcp_origin_error(scope)
            if error is not None:
                await error(scope, receive, send)
                return
            await self._protocol_app(scope, receive, send)
            return
        await self._app(scope, receive, send)
