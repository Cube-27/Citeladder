---
title: 'Pagination'
description: 'Read long lists one page at a time with a cursor.'
group: 'API'
order: 352
updated: '2026-11-18'
---

Lists that can grow return one page at a time. Most return:

```json
{ "items": [ … ], "next_cursor": "eyJpZCI6…" }
```

Pass `limit` and the previous `next_cursor` as `cursor` to read the next page. `next_cursor` is `null` on the last page.

A cursor belongs to the endpoint and filters that produced it. Reusing it elsewhere, or after the record it names was deleted, is refused: start again without a cursor.

## Limits by endpoint

Page sizes and envelopes differ between endpoints. Each [endpoint](/api/endpoints/) page has the exact parameters.

| Endpoint                                                  | Page size                                     | Rows in           | A bad cursor answers   |
| --------------------------------------------------------- | --------------------------------------------- | ----------------- | ---------------------- |
| Projects, prompts, audits, prompt generation runs         | `limit` 1–100, default 50                     | `items`           | `400 invalid_cursor`   |
| Site crawl pages, issues and one issue's pages; actions   | `limit` 1–200, default 50                     | `items`           | `400 invalid_cursor`   |
| An action's URLs                                          | Fixed at 10                                   | `items`           | `400 invalid_cursor`   |
| A prompt's answers                                        | `limit` 1–100, default 25                     | `items`           | `422 validation_error` |
| Answers, cited sources and query fan-out (`visibility/…`) | `limit` 1–500, default 100                    | `items`           | `422 validation_error` |
| Ads in answers                                            | `limit` 1–50, default 20                      | `creatives.items` | `422 validation_error` |
| AI traffic pages and coverage                             | `limit` 1–100, default 10                     | `items`           | `422 validation_error` |
| Performance table                                         | `page_size` 10, 25, 50 or 100; default 10     | `items`           | `400 invalid_cursor`   |
| Search dataset rows                                       | `limit` 1–200, default 50                     | `rows`            | `422 invalid_cursor`   |
| Search intelligence runs                                  | `offset` from 0 and `limit` 1–100, default 25 | a bare array      | (no cursor)            |

The answers list (`visibility/answers`) also returns `truncated`, which is `true` when more answers match than one page holds.
