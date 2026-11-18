---
title: 'Pagination'
description: 'Read long lists one page at a time with a cursor.'
group: 'API'
order: 352
updated: '2026-11-18'
---

Lists that can grow return one page at a time:

```json
{ "items": [ … ], "next_cursor": "eyJpZCI6…" }
```

Pass `limit` (up to 100) and the previous `next_cursor` as `cursor` to read the next page. `next_cursor` is `null` on the last page.

A cursor belongs to the endpoint and filters that produced it. Reusing it elsewhere, or after the record it names was deleted, returns `400 invalid_cursor`; start again without a cursor.
