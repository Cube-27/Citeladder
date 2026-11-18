---
title: 'Rate limits'
description: 'How many requests a key and a workspace can make, and what happens over the limit.'
group: 'API'
order: 354
updated: '2026-11-18'
---

Each key can make 600 requests a minute and each workspace 1,200. Over the limit the API answers `429 rate_limited` with a `Retry-After` header in seconds. Wait that long, then retry.
