---
title: 'API changelog'
description: 'Additions and changes to the REST API within v1.'
group: 'API'
order: 356
updated: '2026-11-18'
---

Additions and changes within `v1`. Existing fields keep their meaning; new fields and operations are added without a new version.

## November 18, 2026: Bulk prompt changes

New operations, under the `prompts:write` scope:

- [Activate or archive prompts](/api/endpoints/prompts/activate-or-archive-prompts/) (`POST /prompt-sets/{prompt_set_id}/prompts/bulk-status`): up to 500 prompts of one prompt set in one change.
- [File prompts under a topic](/api/endpoints/prompts/file-prompts-under-a-topic/) (`POST /prompts/bulk-topic`): up to 500 of the project's prompts; `topic_id: null` takes them out of every topic.
- [Delete prompts](/api/endpoints/prompts/delete-prompts/) (`POST /prompts/bulk-delete`): up to 500 of the project's prompts.

Each is all or nothing: an id that is not a prompt of the path's prompt set or project refuses the whole request with 404, and nothing changes. Send an `Idempotency-Key` with each.

## November 18, 2026: Field and parameter descriptions

The visibility, perception, query fan-out, prompt metric and competitor suggestion fields, and the shared selection parameters (`audit_id`, `audit_ids`, `market`, `topic`, `engine`, `cohort`, `selection_mode`, `baseline_*`, `standing`, `granularity` and others), now carry a `description` in [openapi.json](https://api.citeladder.com/v1/openapi.json) and on the endpoint pages. [Metrics and states](/api/metrics/) defines each metric. No field or behaviour changed.

## November 18, 2026: Answers, rate limit headers and new visibility fields

New operations, under the `read` scope:

- [List a prompt's answers](/api/endpoints/prompts/list-a-prompt-s-answers/) (`GET /prompts/{prompt_id}/answers`): every successful answer one prompt got across runs, newest first, paged with a cursor.
- [List answers](/api/endpoints/visibility/list-answers/) (`GET /visibility/answers`): the answers of a selection of runs, with the searches they ran, the brands they mentioned and the pages they cited.

Every authenticated response now carries `RateLimit-Policy` and `RateLimit` headers (see [Rate limits](/api/rate-limits/)).

Added to existing operations:

- A `topic` filter on visibility, trends, cited sources, markets, ads and query fan-out. It reads the topics each run froze when it ran.
- Win rate (`win_count`, `win_answers`, `win_rate`), average position and net sentiment for each brand in visibility rankings and prompt metrics.
- Share of voice, sentiment, web search use, sources and named brands on each row of prompt metrics.
- `events` on each trend point: prompt panel changes, engine model changes and Actions going live.
- `share`, `change` and `brands` on each query fan-out row, and the `order` (top, rising or falling) and `search` parameters.
- Perception breakdowns by engine, topic, prompt and over time, and competitor themes.
- [Reject a competitor suggestion](/api/endpoints/competitors/reject-a-competitor-suggestion/), and suggestions found by a name answers used (`kind: named_in_answers`) as well as by a cited domain.

See [Metrics and states](/api/metrics/) for when the new fields are `null` or `0`.

## November 18, 2026: Endpoint pages and a description for every operation

Every operation now has a title, a description and a request and response example, in [openapi.json](https://api.citeladder.com/v1/openapi.json) and on its own page under [Endpoints](/api/endpoints/). Each shared schema has a page too. No operation, field or behaviour changed.
