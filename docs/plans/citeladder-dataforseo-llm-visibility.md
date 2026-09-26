# DataForSEO LLM Scraper integration for AI Visibility

## Summary and confirmed decisions

Status: queued; plan saved on 26 September 2026. Feature implementation has not
started. This document specifies future work, not shipped behavior or permission
to execute it. The current assignment ends after saving this plan and its queued
index entry.

Add DataForSEO ChatGPT and Gemini scraping alongside the existing API engines and
Google AI Overview. Reuse the existing audit, credentials, queue, analysis, and
results owners.

The launch popup offers six independent selections:

| UI option | Stable engine identity | Provider | Fresh manual default |
|---|---|---|---|
| ChatGPT Search | `chatgpt_search` — new | DataForSEO | Selected when connected |
| Gemini | `gemini_consumer` — new | DataForSEO | Selected when connected |
| Google AI Overview | `google_ai_overview` — existing | DataForSEO | Selected when connected |
| ChatGPT API | `chatgpt` — existing | OpenAI | Unselected |
| Gemini API | `gemini` — existing | Google | Unselected |
| Claude API | `claude` — existing | Anthropic | Unselected |

Any nonempty combination is valid, including all six. Existing schedules retain
their exact selections. One customer-provided DataForSEO connection supports all
three DataForSEO options; platform-funded scraping is excluded.

The existing [Prompts and AI Visibility owner](../visibility-prompt.md),
[repository workflow](../../AGENTS.md), and [invariants](../invariants.md) govern
implementation. This plan is indexed as queued in [plan status](ACTIVE.md).

## Implementation changes

### 1. Extend measurement identity and admission

- Add the two engine identities to the existing provider catalog, backend
  validation, frontend schemas, labels, filters, exports, and schedule controls.
  Preserve existing API engine IDs and historical provenance.
- Keep the current `engines: string[]` audit/estimate/schedule request shape.
  Distinct engine identities already fit the existing task and snapshot
  uniqueness boundaries.
- Introduce `llm_scraper` as an execution surface kind. Separate “uses
  asynchronous provider tasks” from “is Google AI Overview”; scraper results
  must never acquire AI Overview trigger/presence semantics.
- Freeze the exact prompt, engine, provider product, connection, request
  settings, market, language, repetition, and processing versions before
  submission. Store the provider-reported model separately from the configured
  scraper product identity.
- Use existing project market/language settings, validated against each
  scraper's supported context. Reject unsupported context or oversized prompts
  before paid submission; never truncate or silently substitute a market.
- Preserve API request policies, scheduling, repairs, and funded API behavior.
  Reject scraper selections in funded mode explicitly.

### 2. Extend shared DataForSEO credentials and execution

- Extend existing connection creation/update to configure all three DataForSEO
  capabilities using one encrypted credential.
- Provide an idempotent provisioning operation for existing DataForSEO
  connections: add missing scraper routes without re-entering credentials,
  changing historical snapshots, or reactivating explicitly disabled routes.
  Execute it as an explicit rollout write, never from a read endpoint.
- Keep connection testing nonbillable through the existing account probe.
  Passing authentication does not claim successful scraper execution.
- Use Standard normal-priority submission and Advanced result retrieval:
  - `/v3/ai_optimization/chat_gpt/llm_scraper/task_post`
  - `/v3/ai_optimization/gemini/llm_scraper/task_post`
  - Corresponding `/task_get/advanced/{id}` endpoints.
- Set `force_web_search=true` for ChatGPT. Do not send that parameter to Gemini.
  Submit the tracked prompt without API-only system instructions. Keep limits
  and request policy in configuration. The documented scraper keyword limit is
  2,000 characters; preserve literal `%` and `+` through transport escaping.
  [ChatGPT submission](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_post/),
  [Gemini submission](https://docs.dataforseo.com/v3/ai_optimization/gemini/llm_scraper/task_post/)
- Extract reusable submission, parking, polling, and reconciliation mechanics
  from the existing AI Overview worker. Keep provider-specific request
  builders, parsers, and finalization separate; do not duplicate the queue or
  force scraper answers into `AioObservation`.
- Preserve commit-before-I/O, leases, credential/account binding, cancellation,
  and bounded retries. Poll an existing paid task instead of resubmitting.
- Reconcile uncertain submissions through `/v3/ai_optimization/id_list` with
  metadata, matching the exact committed tag and expected surface/account.
  Apply bounded pagination and account-level pacing. An unresolved or ambiguous
  submission terminates honestly without automatic paid resubmission.
  [ID-list contract](https://docs.dataforseo.com/v3/appendix/id_list/)
- Retain reported submission charges even when retrieval fails. Retrieval must
  neither overwrite a known submission charge with a free-GET cost nor count
  the charge twice.

### 3. Normalize evidence into existing analysis

- Persist immutable provider evidence and normalize successful answers into
  existing raw artifacts, tasks, response analysis, mentions, citations, and
  cost projections. Reuse CiteLadder's brand/competitor scoring.
- Use the returned answer markdown once; use ordered answer elements only when
  the aggregate answer is absent. Do not concatenate duplicate representations.
- Normalize and deduplicate root and nested `sources` by the existing canonical
  URL rules. Preserve source locations in raw evidence.
- Keep ChatGPT `search_results` distinct from citations: they include retrieved
  but unused results. Feed existing retrieval evidence where supported; do not
  manufacture query-to-source associations. Retain provider `brand_entities` as
  supplementary evidence, not scoring authority.
  [ChatGPT result contract](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/)
- Convert returned `fan_out_queries` into existing ordered search events,
  retaining their task, prompt, run, and engine association.
- Persist explicit fanout availability. Extend the evidence contract with
  `unavailable` and `no_exposed_queries` so missing/null fields and an explicitly
  empty list remain distinguishable. Neither implies “no search”; do not invent
  events or counts.
- Gemini's documented result currently exposes answers and sources but no
  fanout field. Display fanouts only when an actual response explicitly
  supplies valid query evidence.
  [Gemini result contract](https://docs.dataforseo.com/v3/ai_optimization/gemini/llm_scraper/task_get/advanced/)
- Failed, pending, malformed, or empty unusable answers do not create negative
  brand observations. Preserve successful siblings and existing partial-run
  reporting.
- Maintain independent engine filters and comparison identities. API and
  scraper observations may contribute to an explicitly selected combined view,
  but never become one indistinguishable engine series.

### 4. Keep frontend changes limited

- Extend the existing launch popup with the six choices, grouped as consumer
  experiences and APIs. Show unavailable choices with the existing connect/test
  action.
- Initialize connected DataForSEO defaults once per fresh opening. Preserve
  explicit deselection during refetches; do not select APIs automatically when
  DataForSEO is unavailable.
- Update estimates immediately from the exact selection. Launch remains
  disabled with no valid selection.
- Reuse the existing Trends, Sources, Query Fanouts, answer detail, and
  scheduling layouts. Only add catalog entries, distinguishable labels,
  contract support, and truthful availability messages.
- Update the visibility owner document during implementation to describe the
  new selectable surfaces. No new top-level navigation or dashboard redesign.

## Implementation order and validation

Implement in dependency order: catalog/contracts and credentials → shared
asynchronous lifecycle and parsers → persisted evidence/projections → launch
defaults and existing UI integration.

Required coverage:

- **Admission:** arbitrary subsets, all six engines, independent API/scraper
  task slots, workspace isolation, frozen settings, missing credentials, prompt
  escaping/length, and unsupported context.
- **Parsing:** answer fallback, duplicate citations, retrieved-but-uncited URLs,
  observed fanouts, absent/null/empty fanouts, malformed responses, and valid
  answers without citations.
- **PostgreSQL lifecycle:** worker restart, lease loss, pending polling, timeout
  after submission, exact-tag reconciliation, ambiguous matches, credential
  rotation, cancellation, idempotent finalization, and single cost attribution.
- **Compatibility:** unchanged API and AI Overview behavior; saved schedules and
  historical runs preserve their identities; source totals, mention
  denominators, filters, trends, and fanout grouping remain correct.
- **UI:** DataForSEO defaults, all-six selection, deliberate deselection
  surviving refetch, unavailable-option guidance, exact launch payloads, and
  unchanged result navigation.

Run focused backend tests with `uv run pytest`, frontend tests with
`pnpm exec vp test run`, then `./scripts/check.ps1` once after the executable
diff is complete. Keep tests isolated from live credentials and store logs in
the worktree Git directory. Review the final diff under [Review.md](../../Review.md).

No schema migration is expected for engine IDs and JSON provenance. Any necessary
schema change must follow the singular initial-migration policy and be verified
only on disposable data.

## Release boundaries

- Enable selection only after the full path and focused checks pass.
- A separately authorized, bounded live acceptance run must verify both
  scrapers, all-six coexistence, citations, available ChatGPT fanouts, costs,
  and partial failure. Documentation inspection does not establish
  live-provider acceptance.
- Disable new admission if rollback is needed; retain historical evidence and
  allow accepted paid tasks to finish retrieval.
- Keenable, enrichment, platform-funded scraping, new scoring formulas, and
  broader frontend redesign are excluded.
- For the current request, save only the approved plan and queued index entry,
  check documentation links/whitespace, and stop.
