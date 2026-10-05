# API Error Contract — CiteLadder

> The canonical, end-to-end contract for **how a CiteLadder API call fails**: the wire
> envelope every 4xx and 5xx response carries, how the backend produces it, and how the
> frontend consumes it. Companion docs: [`AGENTS.md`](../AGENTS.md),
> [`invariants.md`](invariants.md), [`backend-architecture.md`](backend-architecture.md)
> (§6 subsystem ownership), [`frontend-architecture.md`](frontend-architecture.md) (§6
> drift policy).

The envelope is produced by `frontend/services/api/src/errors.ts`. On the
frontend, `frontend/lib/api/client.ts` parses it and
`frontend/lib/api/errors.ts` owns `ApiError` and its display-safe projection.
The API emits only the `ApiErrorCode` union from
`@citeladder/contracts/error-codes`, whose hand-owned source is the machine-code
authority. Native `config/errors.ts` owns status defaults and retry classification;
message wording and JSON key order are not contracts.

## 1. The wire envelope

Every 4xx or 5xx response — from a router raise, a validation failure, a routing 404, or an unhandled crash — carries exactly this shape:

```jsonc
{
  "detail": "Crawl not found",          // legacy field, retained verbatim
  "error": {
    "code": "not_found",                // stable snake_case machine code
    "message": "Crawl not found",       // human sentence, safe to display
    "request_id": "018f…",              // correlation id for support
    "retryable": false,                 // server-side classification
    "details": { }                      // optional, code-specific extras
  }
}
```

**`error` is additive; `detail` is never removed.** The change is deliberately
non-breaking: the `detail` **value and type** are unchanged, so every pre-existing
client and test that reads the legacy `detail` field keeps working — including the
coded-dict dialect (`{"code", "message", …}`) that the
selection/opportunity/crawl endpoints already returned. New code reads `error`.

### Field rules

| Field | Rule |
|---|---|
| `code` | Stable and machine-readable. Clients branch on this, never on `message`. |
| `message` | A human sentence. **Never** a raw JSON blob, stack trace, or bare token. |
| `request_id` | The correlation id; also echoed in the `X-Request-ID` response header. |
| `retryable` | Explicit per-error value when set, else classified from the status code. |
| `details` | Present only when a code defines extras (e.g. `current_selection_version`). |

## 2. Backend production

The native `errors.ts` handlers translate `ApiError`, framework HTTP failures,
unknown paths and uncaught exceptions into the same envelope. Method guards
produce coded 405 responses. Request validation projects safe issue paths,
messages and codes without echoing the input payload.

Routes throw `ApiError` or the shared `notFound(resource)` helper:

```typescript
throw new ApiError(409, 'The selection changed since you loaded it.', {
  code: 'stale_selection_version',
  details: { current_selection_version: 7 },
});
```

An explicit `detail` may retain a legacy coded-dict shape; the canonical
`error` block still contains a machine code and human message. Unhandled errors
log internal diagnostics with a request ID and return a fixed 500 message.
Never return stack traces, SQL, credentials or raw provider bodies.

## 3. Frontend consumption

`lib/api/client.ts` converts any non-2xx into an `ApiError` carrying
`status`, `code`, `retryable`, `requestId`, and the raw `body`.

`readErrorBody` extracts a display-safe message in strict priority order, so the same
UI code works against migrated and unmigrated endpoints alike:

1. canonical `error.message` / `error.code` / `error.retryable` / `error.request_id`;
2. string `detail` (classic FastAPI);
3. object `detail.message` / `detail.code` (legacy coded dialect);
4. FastAPI validation array — first item humanized as `field.path: message`;
5. the response status text.

**A raw JSON blob is never surfaced as a message** at any step.

### Transport guarantees

- **Bounded timeout** per attempt (`getApiRequestTimeoutMs`, default 30s, override with
  `NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS`). An expiry becomes a retryable
  `code: 'request_timeout'` — never an endless spinner.
- **Bounded retry** (max 2 attempts, `API_RETRY_BACKOFF_MS` linear backoff) for GET and
  idempotent calls only — **never** an ordinary mutation.
- A caller's own `AbortSignal` stays a plain abort and is never retried.

### Displaying a failure

`MutationNotice` (`components/ui/mutation-notice.tsx` + `lib/api/mutation-notice.ts`) is
the shared mutation-failure surface:

- **4xx** — show the server's reason **verbatim**. It is actionable and user-caused; a
  "try again" invitation would be wrong (the same request will fail identically).
- **5xx / network** — show retry copy plus the `request_id` for support.

## 4. Response validation policy (tolerant-on-unknown)

Full rationale in [`frontend-architecture.md`](frontend-architecture.md) §6. In short:
response objects use `responseObject` (zod `.strip()`), so an **additive** backend field
can never break a screen, while a **declared** field that goes missing still fails loud.
The native API and browser import the same response schemas from
`@citeladder/contracts`; route handlers are typed against those schemas.
`pnpm check:contract` validates the native route-family declarations and
API/protocol ingress. The former Python component comparison and OpenAPI
artifact were retired after their final mapped product route moved.

## 5. Adding a new error code

1. Add the machine code to `frontend/packages/contracts/src/error-codes.ts`.
2. Throw `ApiError`, or `notFound(resource)` for repeated 404s, from the owning native route.
3. If the frontend must branch on it, handle the `code` in the calling module — do not
   match on `message` text.
4. Cover it in the relevant native API test under `frontend/services/api/test/`.
Workspace creation additionally uses `workspace_limit_exceeded` with a safe
`limit` detail when the account has reached the configured tenant-root cap.
Site Health admission and page reruns return 403 `entitlement_unresolved`
with `retryable: false` when persisted grants are corrupt or cannot be folded.
