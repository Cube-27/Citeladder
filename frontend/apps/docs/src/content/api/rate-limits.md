---
title: 'Rate limits'
description: 'How many requests a key and a workspace can make, and what happens over the limit.'
group: 'API'
order: 354
updated: '2026-11-18'
---

Each key can make 600 requests a minute and each workspace 1,200. Over the limit the API answers `429 rate_limited` with a `Retry-After` header in seconds. Wait that long, then retry.

## Rate limit headers

Every authenticated response reports both windows in the RateLimit fields of the [IETF draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/):

```http
RateLimit-Policy: "key";q=600;w=60, "workspace";q=1200;w=60
RateLimit: "key";r=587;t=42, "workspace";r=1150;t=42
```

`RateLimit-Policy` names each window with its quota (`q`, requests) and length (`w`, seconds). `RateLimit` gives the requests remaining (`r`) and the seconds until that window resets (`t`). A `429` carries `RateLimit` for the window that ran out, with `r=0`. Slow down before `r` reaches 0 rather than waiting for the refusal.
