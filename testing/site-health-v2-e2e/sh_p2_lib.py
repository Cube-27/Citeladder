#!/usr/bin/env python3
"""Shared helpers for the Site Health v2 P2 e2e suites (B Free / C deny / D Starter).

Self-contained (stdlib only). Each suite imports this module via
``sys.path.insert(0, str(Path(__file__).resolve().parent))`` — no /tmp copies.

Environment:
- ``FIXTURE_URL`` (required): public fixture tunnel root, WITH trailing slash
  (e.g. ``https://<host>.preview.us1.vorflux.com/``). The crawler enforces an
  SSRF url_policy, so a loopback URL is rejected — the fixture must be exposed.
- ``SH_API_BASE`` (optional): API root, default ``http://localhost:8000/api/v1``.
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("SH_API_BASE", "http://localhost:8000/api/v1").rstrip("/")
FIXTURE_URL = os.environ["FIXTURE_URL"]

# Harness identity. sh-seed.sh and sh-p2-run-starter.sh use the same email —
# keep all three in sync (the Starter wrapper resolves the workspace through
# workspace_members for this user).
HARNESS_EMAIL = "sh-p1-test@searchify.dev"
HARNESS_PASSWORD = "ShP1Test!2026Secure#Pass"

TERMINAL_STATUSES = frozenset(
    {"completed", "partially_completed", "failed", "cancelled"}
)

_results: list[tuple[str, bool]] = []


class Api:
    """Cookie-jar JSON session against the backend API (session-cookie auth)."""

    def __init__(self, base: str = BASE):
        self.base = base.rstrip("/")
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )

    def req(self, method: str, path: str, body=None, raw: bool = False):
        """One request. ``raw=True`` returns ``(status, bytes)`` (exports);
        otherwise ``(status, parsed-json-dict)``. Never raises on HTTP errors."""
        url = path if path.startswith("http") else self.base + path
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method.upper())
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with self._opener.open(request, timeout=120) as resp:
                payload, code = resp.read(), resp.status
        except urllib.error.HTTPError as exc:
            payload, code = exc.read(), exc.code
        if raw:
            return code, payload
        if not payload:
            return code, {}
        try:
            return code, json.loads(payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return code, {"_raw": payload.decode("utf-8", "replace")}

    def get(self, path: str):
        return self.req("GET", path)

    def post(self, path: str, body=None):
        return self.req("POST", path, body)

    def put(self, path: str, body=None):
        return self.req("PUT", path, body)


def check(label: str, ok: bool, detail: str = "") -> None:
    """Record + print one assertion."""
    _results.append((label, bool(ok)))
    line = f"[{'PASS' if ok else 'FAIL'}] {label}"
    if not ok and detail:
        line += f"  -- {detail}"
    print(line, flush=True)


def summary(title: str) -> int:
    """Print totals; return the process exit code (0 = all pass)."""
    total = len(_results)
    failed = [label for label, ok in _results if not ok]
    print(f"\n== {title}: {total - len(failed)}/{total} passed, "
          f"{len(failed)} failed")
    if failed:
        print("Failed checks:")
        for label in failed:
            print(f"  - {label}")
    return 0 if not failed else 1


def register_or_login(api: Api) -> None:
    """Register the harness user (201); on 400 (already registered) log in.

    Verified: ``api/auth.py`` maps ``EmailAlreadyRegisteredError`` to
    HTTP 400, not 409.
    """
    creds = {"email": HARNESS_EMAIL, "password": HARNESS_PASSWORD}
    code, body = api.post("/auth/register", creds)
    if code == 201:
        print(f"  registered {HARNESS_EMAIL}")
        return
    if code == 400:
        code, body = api.post("/auth/login", creds)
        if code == 200:
            print(f"  logged in {HARNESS_EMAIL}")
            return
    raise SystemExit(
        f"auth failed for {HARNESS_EMAIL}: {code} {json.dumps(body)[:300]}"
    )


def create_project(api: Api, name: str) -> str:
    """Create a project pointing at the fixture tunnel; return its id."""
    code, body = api.post("/projects", {
        "name": name,
        "brand_name": name,
        "website_url": FIXTURE_URL,
    })
    assert code == 201, f"create project: {code} {json.dumps(body)[:300]}"
    return str(body["id"])


def create_crawl(api: Api, project_id: str) -> str:
    """Enqueue a site crawl; return its id."""
    code, body = api.post("/site-crawls", {"project_id": project_id})
    assert code == 201, f"create crawl: {code} {json.dumps(body)[:300]}"
    return str(body["id"])


def wait_crawl(api: Api, crawl_id: str, timeout_s: float = 600.0,
               interval_s: float = 2.0) -> dict:
    """Poll the crawl until a terminal status; return the final crawl dict."""
    deadline = time.monotonic() + timeout_s
    last_status = None
    while True:
        code, crawl = api.get(f"/site-crawls/{crawl_id}")
        assert code == 200, f"poll crawl: {code} {json.dumps(crawl)[:300]}"
        status = crawl.get("status")
        if status != last_status:
            print(f"  crawl {crawl_id[:8]} status={status}", flush=True)
            last_status = status
        if status in TERMINAL_STATUSES:
            return crawl
        if time.monotonic() > deadline:
            raise SystemExit(
                f"crawl {crawl_id} not terminal within {timeout_s:.0f}s "
                f"(last status={status})"
            )
        time.sleep(interval_s)


def list_all(api: Api, path: str, limit: int = 200) -> list[dict]:
    """Walk an ``items``/``next_cursor`` list endpoint into one list."""
    items: list[dict] = []
    cursor: str | None = None
    while True:
        sep = "&" if "?" in path else "?"
        paged = f"{path}{sep}limit={limit}"
        if cursor:
            paged += f"&cursor={urllib.parse.quote(cursor, safe='')}"
        code, page = api.get(paged)
        assert code == 200, f"list {path}: {code} {json.dumps(page)[:300]}"
        items.extend(page.get("items") or [])
        cursor = page.get("next_cursor")
        if not cursor:
            return items
