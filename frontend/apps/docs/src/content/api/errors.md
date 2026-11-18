---
title: 'Errors'
description: 'The shape of every error response and the codes to branch on.'
group: 'API'
order: 355
updated: '2026-11-18'
---

Every error has the same shape:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "A valid API key is required",
    "request_id": "…",
    "retryable": false
  }
}
```

Branch on `code`. Common codes:

| Code                          | Status | Meaning                                                                                              |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `invalid_cursor`              | 400    | The cursor came from another endpoint or other filters, or its record is gone                        |
| `invalid_api_key`             | 401    | The key is missing, revoked or expired                                                               |
| `api_access_not_in_plan`      | 403    | The workspace's plan does not include API access                                                     |
| `workspace_role_forbidden`    | 403    | The key's scope, or its creator's role, does not allow the operation                                 |
| `not_found`                   | 404    | The record does not exist, or the key cannot reach its project                                       |
| `idempotency_conflict`        | 409    | The key was reused with a different body, or its first request is still running                      |
| `idempotency_outcome_unknown` | 409    | The original request failed with a server error, so it may have taken effect                         |
| `estimate_exceeds_limit`      | 409    | An audit launch's estimate is above `max_attempts`; nothing was created                              |
| `unsupported_media_type`      | 415    | A request body was sent without `Content-Type: application/json`                                     |
| `validation_error`            | 422    | The request is malformed, a write has no `Idempotency-Key`, or (on some lists) the cursor is invalid |
| `rate_limited`                | 429    | The key or workspace is over its [rate limit](/api/rate-limits/)                                     |

`retryable` says whether sending the same request again can succeed. It is `true` for `429` and for an `idempotency_conflict` whose first request is still running: wait, then retry with the same key. A reused key with a different body is not retryable. [Pagination](/api/pagination/) lists which lists answer a bad cursor with `400` and which with `422`.

Quote `request_id` when you contact support.
