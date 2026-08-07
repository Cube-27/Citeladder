# Site Intelligence Performance Contract

**Status:** design and acceptance contract; no crawler settings are changed by this catalog slice  
**Primary rule:** classification must remain negligible beside fetch, parse, and persistence work

## Scope

This contract covers the deterministic industry-role hot loop and the crawler/persistence
constraints that must be considered when it is wired into Site Health. It does not claim parity
with a desktop crawler and does not authorize bypassing robots policy, SSRF controls, response
limits, workspace isolation, leases, or evidence provenance.

## Current measured configuration surface

The shipped Site Health defaults currently include:

| Area | Default |
|---|---:|
| Worker/global concurrency | `8` / `8` |
| Per-host concurrent fetches | `2` |
| Minimum per-host start delay | `0.5 s`, increased by robots crawl-delay |
| Link-check concurrency | `8`, still governed by the per-host gate |
| Request timeout / redirects | `20 s` / `5` |
| Wire / decoded / parser HTML caps | `5 MB` / `20 MB` / `5 MB` |
| Extracted links / structured-data blocks / text | `2,000` / `100` / `200,000` characters |
| Full frontier / max depth | `50,000` URLs / `20` |
| Admission batch | `200` URLs |
| Sample inventory / analyzed URLs | soft `200` / `10` |
| Sitemap documents / admitted sitemap URLs | `32` / `5,000` |
| Per-page link probes | `200` |

These defaults prioritize bounded operation and host politeness. A `0.5 s` start spacing means a
single host cannot begin more than roughly two requests per second before network latency,
robots-declared delays, retries, parsing, database work, or link checks are considered. Raising
only global concurrency will not improve a one-host crawl while the host gate is binding.

## Current bottlenecks and risks

### Fetcher lifecycle and connection reuse

`SecureFetcher` owns a reusable `httpx.AsyncClient`, but the discover, analyze, and link-probe paths
usually create a new fetcher context per request. Sitemap traversal reuses one fetcher across its
loop. The per-request pattern preserves correctness but limits connection-pool reuse and adds
setup/teardown overhead.

A future throughput slice may move one fetcher/client to a worker-owned lifecycle only after
proving:

- pinned-IP, Host/SNI, redirect, and DNS-rebinding protections remain identical;
- test transport injection remains isolated;
- cancellation and worker shutdown close every client;
- no credentials, cookies, or unsafe state leak across tasks/hosts;
- per-host gates and robots policies still apply before every network call.

### Persistence round trips

The analyze writer flushes the page analysis and then flushes every rule evaluation individually
to obtain IDs before creating linked issues. This is deterministic but can make database
round-trips scale with the number of rules per page. Industry-role classification itself is not the
likely bottleneck; persistence shape, link checking, and network pacing are more material.

A later optimization should allocate/link records without one flush per evaluation where the ORM
and database contract allow it, then compare SQL statement count and transaction latency. It must
preserve unique constraints, provenance, failure isolation, and idempotent retry behavior.

### Link checking

Up to 200 targets per page may be probed, with `HEAD` and possible `GET` fallback. Link checks can
therefore dominate elapsed time after page analysis appears complete. Cross-host concurrency helps,
but same-host probes remain intentionally paced. UI/progress semantics must distinguish page
analysis completion from outstanding link-check work.

### Large-crawl state

A 50,000-URL frontier magnifies queue rows, observations, artifacts, rule evaluations, issues,
heartbeats, retries, and snapshot aggregation. Memory bounds on extracted facts do not by
themselves bound database growth. Before claiming large-crawl readiness, measure row counts,
index sizes, transaction duration, lease churn, terminalization, and export behavior at each scale.

## Industry classifier hot-loop contract

The production path must:

- load and hash-verify the exact pack before work begins;
- compile regexes and immutable role records once, outside the page loop;
- perform no file, database, network, queue, embedding, or model I/O per page;
- cap every scalar and collection input;
- cap evidence, alternatives, conflicts, and secondary roles;
- avoid copying full HTML or unbounded JSON into evidence;
- return deterministic output for identical pack bytes and normalized facts;
- retain explicit abstention rather than spending model tokens in the hot loop.

[`benchmark.py`](benchmark.py) enforces the benchmark scope: catalog I/O, JSON parsing, hash
verification, and regex compilation happen before timing. The fixture cycle is deterministic and
the result checksum makes output drift visible.

## Benchmark commands and interpretation

From `backend/`:

```bash
uv run python -m app.core.config.industry_packs.benchmark --pack education --pages 10000
uv run python -m app.core.config.industry_packs.benchmark --pack commerce --pages 10000
```

Record at minimum:

- repository revision and dirty-state caveat;
- Python/platform information when comparing machines;
- pack ID, version, content hash, and classifier version;
- page count, warm-up count, fixture count, elapsed time, pages/second, and mean microseconds/page;
- classified/abstained/conflict counts and checksum.

The harness is a microbenchmark, not an end-to-end crawl result. It does not measure HTTP, HTML
parsing, DNS, robots, database writes, rule evaluation, link checks, APIs, or frontend rendering.
Do not convert its throughput directly into a production pages-per-second promise.

## Scale test matrix for production wiring

Run representative Education and Commerce crawls at approximately 100, 1,000, 10,000, and 50,000
admitted URLs where policy permits. Capture:

| Dimension | Required metrics |
|---|---|
| Acquisition | request starts/completions per second, latency percentiles, status/error/retry mix, bytes, redirect hops, robots delay |
| Queue | claim latency, leased/running depth, heartbeat age, retry parks, sweeper work, terminalization lag |
| Parsing/classification | parse time, generic and industry classifier time, abstention/margin/conflict distributions, fact sizes |
| Persistence | SQL statement count, flush/commit latency, rows/page, deadlocks, constraint retries, index growth |
| Link checks | probes/page, same-host versus cross-host, `HEAD` fallback, elapsed tail after analysis |
| API/UI | dashboard and page-query latency, cursor stability, payload size, SSE lag, export time |
| Resources | process CPU, RSS, open connections/files, database CPU/I/O, network saturation |

No threshold should be described as safe merely because a small fixture benchmark passes.

## Performance profiles

Keep the current defaults as the conservative profile. A future opt-in high-throughput profile may
raise global concurrency, batch sizes, and connection reuse only with:

- an explicit environment/config owner;
- strict upper bounds and validation;
- per-host politeness retained;
- adaptive backoff for `429`, `503`, timeouts, and transport pressure;
- database pool capacity checks;
- measured queue and transaction behavior;
- operator-visible metrics and rollback;
- fixture and end-to-end regression runs.

Do not hide performance changes in pack JSON. Packs define semantic knowledge, not crawler network
policy.

## Acceptance before claiming throughput readiness

1. Exact 10,000-page classifier benchmarks pass for Education and Commerce.
2. Classifier p95 remains a small fraction of parse/evaluation time in an instrumented worker run.
3. No per-page catalog I/O or regex compilation appears in profiles.
4. Output bounds hold for adversarial long inputs.
5. Connection-lifecycle changes pass SSRF/DNS/redirect/cancellation tests.
6. Persistence batching preserves IDs, provenance, uniqueness, retries, and workspace isolation.
7. At least one representative 10,000-page run completes without leaked clients, unbounded memory,
   stuck leases, or nonterminal crawl state.
8. Published numbers state the exact scope and hardware; no Screaming-Frog-equivalent claim is made
   without a directly comparable benchmark.
