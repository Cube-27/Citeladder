---
title: 'REST API'
description: 'Read your reports and manage prompts, competitors, audits and actions from your own code.'
group: 'Use the REST API'
order: 350
---

The CiteLadder REST API gives your scripts, dashboards and pipelines the same data and actions as the app. It is available on paid plans at **https://api.citeladder.com/v1**. Every request runs through the same checks as the app, so a key can never do more than the person who created it.

## Create a key

Owners and Admins create keys in **Settings → API keys**:

1. Name the key after what will use it, such as _Weekly export_.
2. Choose what it can do. **Read** is always included.
3. Choose all projects or only some, and optionally an expiry date.
4. Copy the key. It is shown once; CiteLadder stores only a fingerprint of it.

A workspace can hold ten live keys. Revoke a key there at any time; requests with it are refused at once.

## Authenticate

Send the key as a bearer token. Cookies are ignored.

```bash
curl https://api.citeladder.com/v1/projects \
  -H "Authorization: Bearer cl_live_…"
```

## Scopes

| Scope               | Lets the key                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `read`              | Read projects, prompts, audits, visibility and every other report   |
| `prompts:write`     | Create, edit and import prompts and topics; run prompt generation   |
| `competitors:write` | Add, edit and remove competitors; accept competitor suggestions     |
| `audits:run`        | Launch and cancel audits                                            |
| `schedules:write`   | Create, change, pause and delete audit schedules                    |
| `actions:write`     | Change an action's status and record an implementation              |

A key acts for the person who created it. If that person's role changes, the key changes with it: a key created by an Admin who becomes a Viewer can only read. If the person leaves the workspace, their keys are revoked.

## Paths and pagination

Everything except the project list lives under a project: `/v1/projects/{project_id}/…`. A key limited to some projects receives `404` for any other project, and for any prompt, audit or action that belongs to another project.

Lists that can grow return one page at a time:

```json
{ "items": [ … ], "next_cursor": "eyJpZCI6…" }
```

Pass `limit` (up to 100) and the previous `next_cursor` as `cursor` to read the next page. `next_cursor` is `null` on the last page.

## Idempotency

Every `POST` that creates something or spends credits needs an `Idempotency-Key` header, such as a UUID you generate per operation. If a network error leaves you unsure whether a request succeeded, send it again with the same key and body: you receive the original response, marked `Idempotent-Replayed: true`, and nothing happens twice. Reusing a key with a different body returns `409 idempotency_conflict`. Keys are remembered for 24 hours.

## Launch an audit safely

Estimate first, then launch in one call with a ceiling:

```bash
curl https://api.citeladder.com/v1/projects/$PROJECT/audits/estimate \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"prompt_set_id":"…","engines":["chatgpt"]}'

curl https://api.citeladder.com/v1/projects/$PROJECT/audits \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt_set_id":"…","engines":["chatgpt"],"max_estimated_credits":12}'
```

`max_estimated_credits` caps the estimate's `maximum_attempt_count`, the most credits the audit can reserve. If the estimate is higher, nothing is created and the response is `409 estimate_exceeds_limit` with both numbers. A launched audit is queued and runs on its own; read its status with `GET /v1/projects/{project_id}/audits/{audit_id}`.

## Rate limits

Each key can make 600 requests a minute and each workspace 1,200. Over the limit the API answers `429` with a `Retry-After` header in seconds.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "invalid_api_key", "message": "A valid API key is required", "request_id": "…", "retryable": false } }
```

Branch on `code`. Common codes: `invalid_api_key` (401: missing, revoked or expired key), `api_access_not_in_plan` (403), `workspace_role_forbidden` (403: the key's scope or its creator's role does not allow the operation), `not_found` (404), `validation_error` (422), `idempotency_conflict` and `estimate_exceeds_limit` (409) and `rate_limited` (429). Quote `request_id` when you contact support.

## Values that are not numbers

Like the app, the API keeps unknown, unavailable, not measured and zero apart. A prompt's `latest_measurement` is either `{"state": "measured", …}`, whose rates are `null` when that run could not determine them, or `{"state": "not_measured"}`. Never treat a missing value as zero.

The [reference](/api/reference/) lists every operation; [openapi.json](https://api.citeladder.com/v1/openapi.json) describes every field.
