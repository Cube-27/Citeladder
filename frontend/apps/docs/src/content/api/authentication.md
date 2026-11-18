---
title: 'Authentication and scopes'
description: 'Create an API key, send it as a bearer token and choose what it can do.'
group: 'API'
order: 351
updated: '2026-11-18'
---

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

| Scope               | Lets the key                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `read`              | Read projects, prompts, audits, answers, visibility and the other public reports |
| `prompts:write`     | Create, edit, import, activate, archive and delete prompts and topics; generate  |
| `competitors:write` | Add, edit and remove competitors; accept or reject competitor suggestions        |
| `audits:run`        | Launch and cancel audits                                                         |
| `schedules:write`   | Create, change, pause and delete audit schedules                                 |
| `actions:write`     | Change an action's status and record an implementation                           |

Each [endpoint](/api/endpoints/) page names the scope it needs.

A key acts for the person who created it. If that person's role changes, the key changes with it: a key created by an Admin who becomes a Viewer can only read. If the person leaves the workspace, their keys are revoked.
