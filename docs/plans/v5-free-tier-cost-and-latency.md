# Free-tier cost + latency — research and proposed plan

> **Status: PROPOSAL — not approved, nothing here is implemented.** Owner decision needed on
> the free/paid split in §5 before any of §6 is built. Research date: 2026-07-26.
> Companion docs: [`design.md`](../design.md), [`backend-architecture.md`](../backend-architecture.md),
> [`invariants.md`](../invariants.md).

## 1. The problem

A run of 10 prompts against one provider costs **~$1** and takes **~4 minutes**. Neither
number survives contact with a free tier, and the reported figure is confirmed by
measurement, not estimate — see §2.

Target stated by the owner: **10–20 prompts per provider, under 1 minute, at a cost that can
be given away.**

## 2. Where the cost actually goes (measured)

Taken from `raw_response_artifacts` for a real Claude run (`claude-sonnet-4-6`, 10 calls,
`repetitions = 1`). Averages: **16,041 input tokens / 1,292 output tokens / 1.5 web searches**
per call.

| Component | Rate | Per call | Share |
|---|---|---|---|
| Input tokens | $3 / MTok | $0.0481 | **58%** |
| Output tokens | $15 / MTok | $0.0194 | 24% |
| `web_search` server tool | $10 / 1,000 | $0.0150 | 18% |
| **Total** | | **$0.0825** | |

10 prompts x $0.0825 = **$0.83**. Matches the reported ~$1.

**The dominant cost is input tokens, and those input tokens are the web-search results being
injected back into context.** A one-line shopping question becomes a 16,000-token prompt.
This is the single most important fact in this document: the problem is *grounding*, not
model choice and not prompt length.

### 2.1 Two consequences that rule out the obvious fixes

- **Prompt caching cannot help.** Caching needs a stable prefix. The input here is 16k tokens
  of per-call-unique search results, and `consumer_like` mode sends no system instruction at
  all (`system_instruction_for_mode` returns `""`). There is no shared prefix to cache.
- **Migrating to Sonnet 5 is not a cost win.** $2/$10 intro (through 2026-08-31) vs the
  current $3/$15, but Sonnet 5 ships a new tokenizer producing ~30% more tokens for the same
  text. Net ≈13% cheaper during the intro window, then ~30% *more* expensive. Do not migrate
  for cost.

## 3. Where the latency goes (measured)

Correlation across the same 10 artifacts:

| Relationship | Coefficient |
|---|---|
| answer length ↔ latency | **r = 0.982** |
| search count ↔ latency | r = 0.840 (confounded — more searches ⇒ longer answers) |

Throughput is a flat **~129 characters/second** (≈27–31 output tok/s). The one fast call in
the set (3.4s) used no web search and returned 494 characters — it sits on the same line, so
search overhead is second-order and **answer length is the whole story**.

Measured wall clock: **104s for 10 Claude calls** at the pre-fix `worker_concurrency = 4`.

### 3.1 Why "<1 min" is arithmetically impossible for grounded calls

20 prompts x 3 providers = 60 calls x 29s = **1,740 seconds of provider time**. Fitting that
into 60s needs ~29x concurrency. At 16k input tokens per call, 60 concurrent calls burst
**~960k input tokens/minute** — Anthropic's Sonnet tier-4 ceiling is 400k ITPM, and Gemini's
RPM quota is lower still. The run would 429 before it finished.

**Concurrency cannot buy this target.** It has to come from doing less work, or from not
making the user wait.

## 4. What the incumbents do

No engineering write-ups exist (searched). Reverse-engineered from pricing, which is more
reliable anyway.

**[Peec AI](https://peec.ai/pricing): $89/mo for 25 prompts with daily tracking.** That is
25 x ~30 days ≈ 750 runs/month across several engines — roughly 3,000 calls for $89, or
**~$0.03 revenue per call**. Current cost is $0.0825/call: **2.8x their entire revenue per
call, before margin.** The current architecture cannot reach that price point at any volume.

Two structural differences explain the gap:

1. **Nobody runs on demand.** Peec ships *daily scheduled tracking with a countdown timer to
   the next refresh*. The dashboard is always precomputed. Searchify has **no audit scheduler
   at all** — audits are user-triggered only — so users watch a synchronous run finish. That
   is the actual product bug behind "nobody will wait 4 minutes".
2. **A chunk of the market does not use grounded API calls.**
   [seoClarity](https://www.seoclarity.net/blog/scraping-vs.-api) and
   [Search Engine Land](https://searchengineland.com/inside-chatgpt-search-web-run-fan-out-queries-ai-visibility-477339)
   describe tools scraping the consumer interfaces instead of paying per token — a different
   cost structure (proxy infra, no token cost) and a different legal posture.

## 5. Proposal: split free from paid by *grounding*, not by volume

This is the decision that needs owner sign-off.

### 5.1 Free tier — ungrounded

Drop the `web_search` tool. Input collapses from ~16k to ~200 tokens, the search fee
disappears, and answers shorten.

| | Grounded (today) | Ungrounded |
|---|---|---|
| Cost / call | $0.0825 | **~$0.010** |
| Latency / call | 29s | ~10–13s |
| 45 calls @ concurrency 30 | ~90s | **~25s** |
| Input tokens/min @ c=30 | 480k (throttles) | 6k (trivial) |

**88% cheaper, hits the <1 min target, and stops fighting rate limits.** 15 prompts x 3
providers ≈ **$0.45 per refresh**.

It is also a legitimately *different* metric rather than a degraded one: "what does the model
say about your brand unprompted, from training" vs "what does a searching user see". Both are
real; only the second is expensive.

### 5.2 Paid tier — grounded, precomputed, batched

Keep `web_search` (it is the premium signal) but move it off the request path:

| Lever | Effect | Measurement impact |
|---|---|---|
| **Batch API** (50% off tokens) | $0.0825 → ~$0.049 | **None** — only needs refreshes to be scheduled rather than on-demand |
| `anthropic_max_uses` 3 → 1 | cuts search fee + shrinks injected context | Fewer sources per answer |
| Instruct answer brevity | cuts the 24% output share | **Changes what is measured** — do NOT apply in `consumer_like` mode (see §7) |

Stacked: **$0.0825 → ~$0.030/call**, a 64% cut with grounding intact.

### 5.3 Both tiers — add the scheduler

Daily/weekly precomputed refresh so the dashboard is instant on load. The frontend already
polls audits (`ACTIVE_RUN_POLL_MS`) and renders executions progressively, so first-run
onboarding can stream results in — **first insight at ~12s** instead of a 4-minute blank wait.

### 5.4 Regardless of tier — per-provider concurrency caps

The queue claims tasks provider-blind, so a batch can be all-Claude and exhaust one
provider's ITPM while the other two sit idle. Needed before concurrency is raised further.

## 6. Sequencing

1. **Ungrounded free tier + per-provider concurrency caps** — biggest win on both axes, no
   measurement compromise for paid.
2. **Audit scheduler** — removes the perceived-latency problem outright.
3. **Batch API adapter path** — 50% off paid tier; depends on (2).
4. **`max_uses` 1 + output brevity** — incremental; the second carries a fidelity tradeoff.

## 7. Open questions / caveats

- **The ungrounded figures are extrapolated**, from the single ungrounded call in the dataset
  (3.4s, 494 chars) plus token arithmetic — not measured across a real run. Worth a 10-call
  spike before committing.
- **The free/paid split is a product decision** about what Searchify is willing to *not*
  measure for free users. Needs an explicit owner call.
- **Answer brevity conflicts with `consumer_like`'s premise.** That mode deliberately sends no
  system instruction (`audits.py` → `system_instruction_for_mode`) so answers are what a real
  user would see. Injecting "be brief" would shift mention rates and SOV, and break
  comparability with historical runs. Only apply to the localized / forced-grounded modes, or
  accept a documented discontinuity.
- **Input tokens, not output, are the rate-limit constraint.** Grounded calls average ~16k
  input each; any concurrency plan must be sized against the account's ITPM allowance, not its
  RPM.

## 8. Already shipped (2026-07-26, separate from this proposal)

Throughput fixes that stand on their own and are not blocked on the decision above:

- **Convoy fix** — the worker claimed a batch of N, gathered *all* of it, then claimed the
  next N, so a batch cost as much as its slowest member while finished slots idled. Replaced
  with a continuously-refilling pool (`AuditWorker.run_pipelined`). Regression-tested.
- **HTTP connection pooling** — was ~30 TLS handshakes per run, now ~3
  (`connectors/answer_engines/http_client.py`).
- **`worker_concurrency` 4 → 10**, with the DB pool raised 8/12 to cover peak session demand.

Net effect: 30 calls from ~4 minutes to ~90s. Real, but not the <1 min target — that still
needs §5.
