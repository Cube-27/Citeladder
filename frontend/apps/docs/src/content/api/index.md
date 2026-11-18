---
title: 'Introduction'
description: 'Read your reports and manage prompts, competitors, audits and actions from your own code.'
group: 'API'
order: 350
updated: '2026-11-18'
---

The CiteLadder REST API gives your scripts, dashboards and pipelines the same data and actions as the app. It is available on paid plans at `https://api.citeladder.com/v1`. Every request runs through the same checks as the app, so a key can never do more than the person who created it.

[openapi.json](https://api.citeladder.com/v1/openapi.json) describes every operation and field, and you can load it into Postman, Insomnia or a client generator. The [endpoints](/api/endpoints/) are the same document, one page each.

## Paths

Everything except the project list lives under a project: `/v1/projects/{project_id}/…`. A key limited to some projects receives `404` for any other project, and for any prompt, audit or action that belongs to another project.

## Make a first request

Create a key (see [Authentication and scopes](/api/authentication/)), then list your projects:

```bash
curl https://api.citeladder.com/v1/projects \
  -H "Authorization: Bearer cl_live_…"
```

## Launch an audit safely

Estimate first, then launch in one call with a ceiling:

```bash
curl https://api.citeladder.com/v1/projects/$PROJECT/audits/estimate \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"prompt_set_id":"…","engines":["chatgpt"]}'

curl https://api.citeladder.com/v1/projects/$PROJECT/audits \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt_set_id":"…","engines":["chatgpt"],"max_attempts":12}'
```

`max_attempts` caps the estimate's `maximum_attempt_count`: every answer the audit asks for, times its retries. Each recorded answer spends one prompt run. If the estimate is higher, nothing is created and the response is `409 estimate_exceeds_limit` with both numbers. A launched audit is queued and runs on its own; read its status with [Get an audit](/api/endpoints/audits/get-an-audit/).

## Values that are not numbers

Like the app, the API keeps unknown, unavailable, not measured and zero apart. Never treat a missing value as zero.

- **Latest measurement.** A prompt's `latest_measurement` is `{"state": "measured", …}`, whose rates are `null` when that run could not determine them, `{"state": "not_measured"}`, or `{"state": "unavailable"}` for a brand-diagnostic prompt, which has no per-prompt visibility reading.
- **Win rate.** Of the answers naming at least one tracked business, the share that named this one first. `win_answers` is `null` when the answers were recorded before CiteLadder counted wins (unavailable), and `0` when no answer named a tracked business (not applicable). `win_rate` is `null` in both cases.
- **Sentiment.** A `sentiment` object counts the brand's `mentions`, how many were `classified`, and the `positive` and `negative` ones. `net_sentiment` is positive minus negative over classified, from −100 to +100, and `null` when nothing was classified. `sentiment` itself is `null` when the runs were measured without perception. The app shows a figure only from 20 classified mentions; apply your own minimum with the counts.
- **Web search.** `web_search.share` is the share of answers that searched the web among those whose engine reports search use. It is `null` when no engine reported it, which is not 0%. On a single answer, `search` is `used`, `not_used` or `not_reported`.
- **Position.** `avg_position` and an answer's `position` are `null` when the brand was not named or the answer had no ranking.
- **Changes.** A fan-out query's `change`, and other movements against a previous run, are `null` when there was no comparable earlier run.

## Versioning

New fields and operations are added within `v1`; existing fields keep their meaning. The [changelog](/api/changelog/) lists each addition.
