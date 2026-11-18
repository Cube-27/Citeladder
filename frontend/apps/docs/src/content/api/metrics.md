---
title: 'Metrics and states'
description: 'What each visibility metric counts, its range, and what null, zero and each state mean.'
group: 'API'
order: 350.5
updated: '2026-11-18'
---

Every number the visibility endpoints return is computed by CiteLadder from stored answers; a model never sets one. Each endpoint page also describes its fields and parameters.

## Rates and scores

Rates are shares from 0 to 1, counted over completed answers. Scores run from 0 to 100. Changes (`*_delta`) are in percentage points.

| Field                                                   | What it counts                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `mention_rate`, `visibility_rate`, `brand_mention_rate` | Answers that named the brand, over completed answers.                                                                                           |
| `owned_citation_rate`                                   | Answers that cited one of the project's own domains. It counts answers, not citations: `citation_totals.owned_share` is the share of citations. |
| `share_of_voice`                                        | The brand's share of every tracked-business naming: one per business per answer.                                                                |
| `avg_position`                                          | Mean rank among the businesses an answer named, where 1 is named first.                                                                         |
| `win_rate`                                              | `win_count` / `win_answers`: of the answers naming at least one tracked business, the share that named this one first.                          |
| `composite_score`                                       | A prompt's score: mention rate, own-citation rate and, when the project tracks competitors, competitive position, weighted.                     |
| `visibility_score`                                      | The mean prompt score over the run's `core` prompts.                                                                                            |
| `net_sentiment`                                         | (positive − negative) / classified × 100, from −100 to 100.                                                                                     |
| `web_search.share`                                      | Answers that searched the web, over answers whose engine reports search use.                                                                    |
| Fan-out `share`, `change`                               | A query's share of every search the filters keep; `change` is that share minus its share in the previous comparable run.                        |

## Values that are not numbers

Like the app, the API keeps unknown, unavailable, not measured and zero apart. Never treat a missing value as zero.

- **Latest measurement.** A prompt's `latest_measurement` is `{"state": "measured", …}`, whose rates are `null` when that run could not determine them, `{"state": "not_measured"}`, or `{"state": "unavailable"}` for a brand-diagnostic prompt, which has no per-prompt visibility reading.
- **Counts.** In `counts`, a `null` (such as `expected` or `failed`) means the run did not record it, not zero.
- **Win rate.** `win_answers` is `null` when the answers were recorded before CiteLadder counted wins (unavailable), and `0` when no answer named a tracked business (not applicable). `win_rate` is `null` in both cases. A read without the fields doesn't serve win rate.
- **Sentiment.** A `sentiment` object counts the brand's `mentions`, how many were `classified`, and the `positive` and `negative` ones. `net_sentiment` is `null` when nothing was classified. `sentiment` itself is `null` when the runs were measured without perception. The app shows a figure only from 20 classified mentions; apply your own minimum with the counts.
- **Web search.** `web_search.share` is `null` when no engine reported search use, which is not 0%. On a single answer, `search` is `used`, `not_used` or `not_reported`.
- **Position.** `avg_position` and an answer's `position` are `null` when the brand was not named or the answer had no ranking.
- **Changes.** Deltas, and a fan-out query's `change`, are `null` or absent when there was no comparable earlier run.

## Selections

- **Cohort.** `core` counts unbranded prompts, `comparison` prompts that weigh the brand against competitors, and `all` both, counted together over the answers they share rather than blended from the other two.
- **Runs.** `selection_mode` reports how a dashboard read resolved: `latest` (the market's newest finished run), `run` (the one `audit_id` names) or `range` (the runs of one configuration between `from` and `to`).
- **Topic.** `topic` counts answers to prompts filed under that topic when their run froze them. Moving a prompt to another topic changes future runs only.

## Comparison status

A comparison with a baseline run reports a `status`. Deltas are filled only when it is `comparable`.

| Status                 | Meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `comparable`           | Both runs measured the same context completely.                                         |
| `matched_subset`       | Compared over only the prompt and engine cells both runs measured (`matched_*` fields). |
| `partial_coverage`     | One run is missing answers it expected.                                                 |
| `coverage_unavailable` | A run did not record how many answers it expected.                                      |
| `no_observations`      | A run has no completed answer in the selection.                                         |
| `changed_context`      | The measurement context changed between the runs.                                       |
| `identity_unavailable` | The run's measurement context can't be identified.                                      |
| `no_baseline`          | No earlier run to compare with.                                                         |
| `baseline_pending`     | The comparison is still being written.                                                  |

## Perception state

`GET /visibility/perception` reports a `state`. Every brand mention lands in exactly one `coverage` bucket: `classified`, `pending`, `not_assessable`, `low_confidence` or `unavailable` (with a reason).

| State         | Meaning                                               |
| ------------- | ----------------------------------------------------- |
| `value`       | At least one mention was classified with confidence.  |
| `pending`     | Mentions are waiting for classification.              |
| `unavailable` | Nothing could be classified; `reason` says why.       |
| `no_mentions` | No completed answer in the selection named the brand. |
