# Security audit: trust boundaries, secrets and injection

Paste everything below the line into the model, at the repository root.

---

You are a security reviewer auditing CiteLadder's **trust boundaries**: data
entering from the internet, crawled websites, third-party providers and
webhooks, and data leaving through responses, logs and the browser. Your
output is a findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/invariants.md` sections 14 and 18; `Review.md` section "Boundaries".
3. `docs/frontend-architecture.md` (opening section on Content Security Policy).
4. `docs/backend-architecture.md` section "Task queue contract" (origin token
   and public-host admission).

## Scope

- Outbound HTTP: `frontend/services/api/src/web-evidence/`,
  `site-health/page-fetch.ts`, `site-health/discover-task.ts`,
  `site-health/url-admission.ts`, `source-pages/inspector.ts`,
  `commerce/discovery.ts`, `integrations/client.ts`, `models/http.ts`.
- Ingress: `http/origin-token.ts`, `http/body.ts`, `http/params.ts`,
  `auth/`, `billing/webhooks.ts`, `mcp/oauth*.ts`, `mcp/registration.ts`.
- Browser edge: `frontend/apps/app/worker.ts`, `frontend/apps/app/server-proxy.ts`,
  `frontend/lib/config/content-security-policy.ts`, `frontend/lib/safe-http-url.ts`,
  marketing middleware under `frontend/apps/marketing/src/`.
- Logging and errors: `frontend/services/api/src/logging.ts`, `errors.ts`.

## Hunt list

1. **SSRF.** Any user- or crawl-supplied URL fetched server-side must be
   scheme-restricted (http/https), resolved, and rejected for private,
   loopback, link-local and metadata addresses (169.254.169.254,
   `metadata.google.internal` — the API runs on Cloud Run). Check that the
   check applies **on every redirect hop**, not only the first URL, and that
   DNS rebinding between check and connect is handled or bounded.
2. **Credentialed requests to unvalidated hosts.** An integration/provider
   token attached to a request whose host came from configurable or stored
   data without host validation.
3. **Response size and time bounds.** Outbound fetches without a body-size cap,
   timeout or redirect limit (memory exhaustion on a 1 GB page; slowloris
   targets). Decompression bombs on gzip/br bodies.
4. **Secret leakage.** Provider keys, OAuth tokens, Fernet-decrypted
   credentials, origin token or session secrets appearing in: API responses
   or DTOs, error envelopes, structured logs, provider-error bodies passed
   through to clients, Agent context packages, PDFs/exports, or SSE frames.
5. **Webhook authenticity.** Billing webhooks verify the provider signature over
   the **raw** body with a constant-time compare before parsing or acting;
   replays are idempotent; unsigned or mis-signed requests cause no state change.
6. **Origin token and host admission.** Every Cloud Run request requires the
   origin token (including health and MCP); public-host allowlist cannot be
   bypassed with `Host`/`X-Forwarded-Host` tricks; `X-CiteLadder-Client-IP`
   cannot be spoofed by a browser through the Worker.
7. **Cookies and sessions.** `HttpOnly`, `Secure`, `SameSite`, path/domain
   scope; CSRF protection for cookie-authenticated mutations (same-origin
   checks or tokens); OAuth `state`/PKCE validation; open redirects in
   login/consent `redirect`/`next` parameters.
8. **Injection.** SQL built with `sql.raw`/string concatenation from user
   input (search `sql.raw`, `sql.lit`, template strings into `sql\``);
   `LIKE` patterns without escaping (see `db/like.ts`); HTML injection where
   crawled or model text is rendered (`dangerouslySetInnerHTML`, markdown
   renderers in `frontend/lib/markdown`); CSV formula injection in exports.
9. **CSP.** `unsafe-inline` or `unsafe-eval` for scripts, wildcard sources,
   or a response path (error page, proxy pass-through) that drops the policy.
10. **Upload and parse limits.** CSV import and JSON bodies: size limits,
    malformed UTF-8 rejected (Invariant 18), numeric coercion of booleans or
    non-finite numbers.

## Not a finding

- Inline styles allowed in CSP — documented and intentional.
- Cloudflare-injected analytics/Zaraz scripts — not in this repository.
- Root `*.env` files that are git-ignored (check with `git check-ignore`);
  only report an env file if it is **tracked** and contains a real secret.
- Test fixtures with obviously fake keys.

## Subagent split

- A: outbound fetch paths (SSRF, bounds, credentialed hosts).
- B: ingress — origin token, host admission, cookies, CSRF, OAuth, webhooks.
- C: leakage — logging, error envelopes, DTOs, exports, Agent context.
- D: injection and CSP — SQL, LIKE, HTML/markdown rendering, CSV export, CSP.

## Output

Use the report format in `_contract.md`. For SSRF and injection findings, give
the concrete payload (URL, header or input) in the failure scenario.
