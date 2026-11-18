# API Error Contract — CiteLadder

> The canonical, end-to-end contract for **how a CiteLadder API call fails**: the wire
> envelope every 4xx and 5xx response carries, how the backend produces it, and how the
> frontend consumes it. Companion docs: [`CLAUDE.md`](../CLAUDE.md),
> [`invariants.md`](invariants.md), [`backend-architecture.md`](backend-architecture.md),
> [`frontend-architecture.md`](frontend-architecture.md#api-response-schemas).

The envelope is produced by `frontend/services/api/src/errors.ts`. On the
frontend, `frontend/lib/api/client.ts` parses it and
`frontend/lib/api/errors.ts` owns `ApiError` and its display-safe projection.
The API emits only the `ApiErrorCode` union from
`@citeladder/contracts/error-codes`, whose hand-owned source is the machine-code
authority. `config/errors.ts` owns status defaults and retry classification;
message wording and JSON key order are not contracts.

## 1. The wire envelope

Every 4xx or 5xx response — from a router raise, a validation failure, a routing 404, or an unhandled crash — carries exactly this shape:

```jsonc
{
  "error": {
    "code": "not_found",                // stable snake_case machine code
    "message": "Crawl not found",       // human sentence, safe to display
    "request_id": "018f…",              // correlation id for support
    "retryable": false,                 // server-side classification
    "details": { }                      // optional, code-specific extras
  }
}
```

The body has the single key `error`; there is no top-level `detail`. Clients read
`error.code` and `error.message`.

### Field rules

| Field | Rule |
|---|---|
| `code` | Stable and machine-readable. Clients branch on this, never on `message`. |
| `message` | A human sentence. **Never** a raw JSON blob, stack trace, or bare token. |
| `retryable` | Explicit per-error value when set, else classified from the status code. |

## 2. Backend production

The `errors.ts` handlers translate `ApiError`, framework HTTP failures,
unknown paths and uncaught exceptions into the same envelope. Method guards
produce coded 405 responses. Request validation projects safe issue paths,
messages and codes without echoing the input payload.

Routes throw `ApiError` or the shared `notFound(resource)` helper. A 409 refusal uses `conflict(code, message)`: the machine reason is the
`code`, never the `message`. Billing refusals go through `refuse(reason)` in
`billing/refusals.ts`, which pairs each reason code with its sentence, so a
checkout refusal such as `billing_gstin_state_mismatch` reaches the buyer as
"The GSTIN does not match the selected state. Check both and try again."

Unhandled errors
log internal diagnostics with a request ID and return a fixed 500 message.
Never return stack traces, SQL, credentials or raw provider bodies.

## 3. Frontend consumption

`lib/api/client.ts` converts any non-2xx into an `ApiError` carrying
`status`, `code`, `retryable`, `requestId`, and the raw `body`.

`readErrorBody` extracts a display-safe message from the canonical envelope
(`error.message` / `error.code` / `error.retryable` / `error.request_id`) and otherwise
falls back to the response status text.

### Transport guarantees

- **Bounded timeout** per attempt (`getApiRequestTimeoutMs`, default 30s, override with
  `NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS`). An expiry becomes a retryable
  `code: 'request_timeout'` — never an endless spinner.
- **Bounded retry** (max 2 attempts, `API_RETRY_BACKOFF_MS` linear backoff) for GET and
  idempotent calls only — **never** an ordinary mutation.
- A caller's own `AbortSignal` stays a plain abort and is never retried.

### Displaying a failure

`Notice` (`components/ui/notice.tsx`, `kind="mutation"` or `kind="read"`, with
`lib/api/mutation-notice.ts`) is the only way a failure renders. A domain that
words its own refusals (the Agent's `agentWriteFailure`) builds the same notice
and swaps only the message. Billing shows the server's sentence; it words only
the reason codes its reads carry (`unavailable_reason`).

- **4xx** — show the server's reason **verbatim**. It is actionable and user-caused; a
  "try again" invitation would be wrong (the same request will fail identically).
- **5xx / network** — show retry copy plus the `request_id` for support.
- **Recovery** — when a failure has a known fix (resume the upload, start a new chat,
  rerun, reconnect, edit the input) the owner passes it as `recovery`; it replaces the
  generic Try again.

## 4. Response validation policy (tolerant-on-unknown)

Response objects use `responseObject` (zod `.strip()`), so an **additive** backend field
can never break a screen, while a **declared** field that goes missing still fails loud.
The API and browser import the same response schemas from
`@citeladder/contracts`; route handlers are typed against those schemas. Under
`APP_ENV=test` every JSON route's body is also parsed against its schema
([`routes/response-contract.ts`](../frontend/services/api/src/routes/response-contract.ts)),
and a field the schema does not declare fails the request, so a spread database
row cannot leak undeclared columns.
`pnpm check:contract` validates the route-family declarations and
API/protocol ingress.

## 5. Adding a new error code

1. Add the machine code to `frontend/packages/contracts/src/error-codes.ts`.
2. Throw `ApiError`, or `notFound(resource)` for repeated 404s, from the owning route.
3. If the frontend must branch on it, handle the `code` in the calling module — do not
   match on `message` text.
4. Cover it in the relevant API test under `frontend/services/api/test/`.

Codes with cross-feature meaning: `entitlement_unresolved` (403,
`retryable: false`) when persisted grants are corrupt or cannot be folded;
`visibility_not_measured` (404) when nothing is measured for a selection yet,
and `visibility_metrics_pending` (404) when the run exists but its metrics are
not written; a named run or project that does not exist stays `not_found`.
The public API's key and idempotency codes are in [public API](public-api.md).

## 6. Browser error reports

The other direction: the browser reports its own failures to
`POST /api/v1/client-errors` (family `client-errors`,
`frontend/services/api/src/routes/client-errors.ts`), same-origin like every
browser call, so the content security policy's `connect-src 'self'` already
covers it. The body is the strict `clientReportSchema` from
`@citeladder/contracts/client-errors`, an error or a `slow_interaction`; its
`route` carries no query string or fragment. Any other field is refused with 422, and a body over
`config/client-errors.ts` `max_body_bytes` with 413 before it is parsed. Each
client has `client_error_client_limit` reports per
`client_error_window_seconds` (`config/abuse.ts`), then 429 with `Retry-After`.

It works signed in or out. The reporting user comes only from the session; a
missing or stale session reports no user. The workspace is the
`X-Workspace-Id` the browser sends, as on any other call, recorded only when
the session's membership resolution accepts it: a request without the header,
or naming a workspace the user is not a member of, records no workspace and
never falls back to the user's earliest one. The API answers 204 and writes one
structured `client.error` record on the `api.client_errors` logger (a `warning`
for `chunk_load`, an `error` otherwise). Before logging, it removes the query
string and fragment from every URL in the message and stack: absolute,
root-relative (`/projects?q=…`) and relative (`../report?token=…`), where a
word counts as a URL when the part before its `?` or `#` holds a `/` or a
scheme, or what follows is a `key=value` query. A stack frame keeps its
`:line:column`. Cloud Logging collects the record; nothing is stored in
PostgreSQL and nothing is sent to a third party.

A `slow_interaction` report (the page load's slowest interaction at or over
`SLOW_INTERACTION_MS`, sampled by `INTERACTION_REPORT_SAMPLE_RATE`) is logged as
an `info` `client.slow_interaction` record. `POST
/api/v1/client-errors/csp-reports` takes the Reporting API's
`application/reports+json` deliveries without the session (so no reporter is
recorded); each `csp-violation` becomes a `warning` `client.csp_violation`
record without query strings, and other report types are dropped.

`frontend/lib/client-errors.ts` sends the reports: fire-and-forget with
`keepalive` and `priority: 'low'`, one report per error per page load, and at most
`CLIENT_ERROR_REPORTS_PER_SESSION` (`lib/config/operational.ts`) per tab. It
reads the release at report time from the `<meta name="citeladder-release">`
the app build writes into `index.html`, so no hashed script chunk changes with
the commit. Every
`LazyIsland` shows its quiet fallback for a chunk that cannot load, and its
caller chooses what any other error does: `defects="surface"` (charts,
execution evidence) hands it to the screen's boundary, and `defects="contain"`
(the navigation's open-actions count) reports it and renders the fallback in
place, so shell chrome never takes the shell down.
