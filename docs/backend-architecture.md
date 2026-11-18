# Backend architecture

The application API, health/readiness, executing workers and schema tooling are
TypeScript-owned. The one-shot migration job
runs the migrate CLI (the SQL schema baseline) and native identity/grant/catalog
bootstrap from the API image before admitting API rollout.
PostgreSQL owns durable
state and queues. Domain behavior is documented in the feature owners listed in
[the documentation index](README.md); this file owns shared backend mechanics.

Interactive onboarding invokes the discovery worker through an awaited, bounded
API mutation scoped to one authorized discovery; background execution remains
its recovery path. Every operation's family is checked against the shared
route-ownership manifest. Policy lives in native config; the SQL baseline
carries only structural column defaults and constraints. Discovery charges
attempts on completion/recovery; integrations charge at claim and recovery does
not charge a second time.

## Layers and extension

A product write that the public API or MCP also exposes goes through a command
in `src/commands/`. The command declares its `permission` (capability and API
key scope) once and takes only an actor checked against it (`Authorized`; a
member, an API key acting for its creator, or an MCP grant, always with the
live role). A route serving the command declares that permission, so its gate
checks it once before parameters; MCP checks it once with `authorize`. Browser
and public routes call the same command; no route repeats its validation or
limits ([Public API](public-api.md)). Other browser writes authorize in the
route middleware. A write under `/projects/{project_id}` resolves the project
in the active workspace (`active-project`); only an ungated read opens through
the path project alone. Workers, invitations and operators check a stored
actor's live role with `memberCan`, the one membership predicate.

Search the owning domain, callers, types, configuration and tests before adding
another module. Routers do not acquire evidence during a read; connectors do not
own scoring or entitlement decisions; workers coordinate domain operations
rather than restating them. Business logic does not move into generic utilities
for convenience.

Operators (commercial, provider provisioning, acquisition control, agreement
references and account administration) are packaged into the API image; seed and
login tools stay git-ignored under `frontend/services/api/local/`
([Development](DEVELOPMENT.md)). Native startup refuses an unset or unknown `APP_ENV`: only
`development`, `test` and `production` start, and nothing falls back to
development. Outside development and test it enforces the shared production
secret, database, proxy, demo and redirect-origin admission policy; the secret
policy also refuses template-shaped values such as `.env.example`'s
`replace-with-…` and `<your-…>` placeholders. The migrate CLI reads only the
database connection settings, so it needs no application secrets.
Fernet-encrypted provider/OAuth secrets and least-privilege worker environments
keep credential custody separate from product projections.

The platform model gateway in `frontend/services/api/src/models/` is configured
by `DEFAULT_AGENT_API_KEY`, `DEFAULT_AGENT_BASE_URL` and `DEFAULT_AGENT_MODEL`;
the base URL alone chooses the API. `api.anthropic.com` uses the Messages API
through the official SDK, and any other endpoint OpenAI-compatible chat
completions (an output cap sent as `max_completion_tokens`, retried once as
`max_tokens` when the provider rejects the former by name). The gateway has two
metered surfaces:

- `complete` and `structured` for single calls, with JSON Schema instructions
  in the prompt. Callers validate the returned JSON against their own schemas
  and evidence contracts before persistence.
- `converse` for the Agent's native tool calling: content blocks, tools,
  reasoning effort and caching, returned as blocks for append-only replay
  ([Agent](agents.md#streaming-and-the-chat)).

## Task queue contract

The bounded `runner.ts` process composes all six native task lanes and billing
recovery with one PostgreSQL pool (at most four connections) plus one session
holding the drain lock. Lanes run concurrently, each bounded by its own batch
(Site Health and audits keep a pool-bounded set in flight; billing and Agent
recovery take a bounded batch), so one owner's claim window never holds
another's queued work. A lane that made progress runs again at once; an idle
lane runs again after progress elsewhere (successors) or each
`runnerLanes.idlePollMs` while others are busy. Lanes that fetch public
websites (analytics, discovery, Site Health) share one group and take turns,
least recently started first, preserving publisher pacing. A grouped lane
yields its turn only to due work: at the end of its claim window it asks its
group's peers for their next due time and, while none is due, opens another
window instead of yielding. Its time budget
stops new admission; claimed work finishes before the pool closes, except
integration syncs, which yield at the deadline and resume from their committed
pages. A randomized starting lane avoids systematically favouring the same
owner across executions. A failed lane is skipped for the rest of the drain while independent
owners continue; the job still fails, and the error is logged with the lane.

Every lane reclaims its own expired leases on each run, including idle ones,
and reports when its next task is due: the earliest claimable row or lease
expiry (Agent: when an unclaimed turn passes its grace). Billing has no probe;
its retries wait for tick. Analytics, discovery, integrations and Site Health
reclaim through `reclaimExpiredLeases` (`src/queue/recovery.ts`), which takes
the lane's attempt charge; audit recovery locks the parent audit first and holds
uncertain submissions and returns a paid provider task to polling without an
attempt, so it stays in `AuditMaintenance`. Every queue claims
the least recently served workspace first (`queue_workspace_turns`).
The queue-lane owner (`src/queue/task-queue.ts`) takes a lane descriptor
(table, claimable statuses, the status a claim moves to, the attempt the claim
charges, extra readiness, recovery charge) and holds the shared claim, turn
cursor, heartbeat and fenced terminal lock; every lane runs on it (analytics,
Site Health, discovery, Agent, integrations and audits). Site Health,
discovery and integrations claim straight to `running`; the other lanes claim
to `leased` and their worker starts the row. Either way the fence re-checks
owner, attempt and lease expiry at every commit. Domain lifecycle runs
as a claim hook in the claim's transaction (the integration sync-started
event) or stays with the lane: the audit parent-first lock, parks and the per-claim
lease owner (`src/queue/audit-queue.ts`: each claim leases to
`<worker owner>:<nonce>`, because audit claims and uncertain reclaims charge no
attempt to fence on; it also leases due audit schedules), the Agent
turn start and Site Health's crawl lock. A failed attempt's lane log never
carries the error message. An unpinned claim compares
`available_at` with the later of the application clock (producers) and the
database clock (recovery), so clock skew never strands a due row. A claim ranks only the
`claim_candidate_limit` oldest due rows plus as many highest-priority ones
(`config/queue.json`), so its cost does not grow with the backlog and a deep
low-priority backlog never hides newer high-priority work.

The periodic owners (listed in `workers/runner.ts`) each run once per tick and
log their duration. Locally `tick.ts` runs them, then uses the remaining budget for that
same drain. On Cloud Run, Cloud Scheduler calls the API's `/internal/tick`
(`workers/scheduled-tick.ts`, admitted by Google ID token), which runs them
under a short budget and starts the runner job only when a lane has work due.
Periodic owners recheck admission before each occurrence, revocation or recovery
unit. The scheduler claims one occurrence at a time under a runner budget, so
stopping never strands a preclaimed batch; admitted units finish settlement.
Worker-owned lease and crawl backstops still run in each lane, including idle
passes. Runner and tick own background execution. After durable admission, the
browser starts a separate authorized POST for onboarding discovery, Site Health,
Internal Links, audits, Agent turns, integration syncs, Performance range
projections and Commerce competitor discovery. These requests reuse existing
workers scoped to the admitted work, with bounded admission and provider
deadlines, so initial progress does not require a new Cloud Run job. PostgreSQL
leases arbitrate concurrent API and runner claims. Interactive crawls and
competitor discovery also honor the shared drain lock to preserve crawler pacing.
Reads remain persisted-only;
large workloads, future retries and scheduled work retain background execution.
No per-owner daemon remains.
One PostgreSQL advisory lock admits one drain at a time across executions.

With `CLOUD_RUN_RUNNER_JOB` configured, the API observes successful queue/billing
mutations per request at the PostgreSQL connection boundary. Autocommit or
successful COMMIT marks work; rollback, savepoint rollback, aborted transactions
and no-op writes do not. After the request settles, it starts a bounded Cloud Run
job-start request using service-account metadata credentials without awaiting it,
so the response never waits on metadata or Cloud Run. Each API instance keeps
one start in flight: callers during it share that attempt. This also covers
requests whose later operation fails after earlier work committed. Reads do not
start jobs; background worker writes never start jobs. Instead, an execution
that idles keeps its drain while a lane's earliest pending task (Site Health
deferrals and retry backoff) becomes due within its budget, polling for new work
meanwhile. After releasing the drain lock, an execution whose pending work is due
within a fresh budget starts one successor, even when a lane failed (the failed
lanes are left out of that probe); work due later waits for tick. Cloud Run
takes one to three minutes to start an execution (measured October 2026), so a
successor is not an immediate pickup. To hide that start, an execution still
draining three minutes before its deadline, with work due within a fresh
budget, starts its successor early with `RUNNER_HANDOVER`; that start skips the
drain-lock probe (the lock is its own), the successor waits out the in-flight
tail for the lock, and the predecessor starts no second one unless Cloud Run
refused that start. Request-bound
discovery suppresses wake-up because it has no successors. Other interactive
workers keep observation active so successors committed after a
background drain exits still wake the runner. Starts from different instances
may still overlap; existing leases arbitrate claims. A failed start is logged without
tokens/provider bodies and leaves the committed response and work intact for tick.

The Cloud Run API (`K_SERVICE`, or configured runner job outside a job
execution) requires a Worker signature on every request, including
health/readiness and MCP. The Workers never send `CITELADDER_ORIGIN_TOKEN`
itself; they send an HMAC-SHA256 under it over the request's timestamp, method,
public host, path with query and visitor address
(`packages/contracts/src/origin-signature.ts`). The API refuses a signature
older or newer than `policy.api.origin_signature_max_skew_seconds`, and accepts
the previous key during rotation. Missing keys fail startup. The signed public
host must be allowlisted (the app, apex or API host), which MCP origin checks
use. Only the API host serves `/v1/...` and the MCP protocol paths, and it
serves nothing else. The signed `X-CiteLadder-Client-IP` becomes the client
identity for rate limits. Cloud Run uses a TCP startup probe;
authenticated HTTP probes must send the origin and public-host headers. Runtime commands and environment settings are owned by
[Development](DEVELOPMENT.md#scale-to-zero-runtime).

Queue work claims with `FOR UPDATE SKIP LOCKED`, commits the lease before
network I/O and never holds a transaction across a provider call; terminal state
and derived rows are written atomically, and cancellation, retries and
reconciliation are idempotent. The combined cross-domain lock order is owned by
[architecture](architecture.md#combined-transaction-lock-dag). Domain-specific
lease, cancellation, retry and terminalization details belong to the affected
feature owner. PostgreSQL concurrency needs its real boundary; an in-memory
mock cannot establish lock safety.

## API and persistence rules

[Workspace access](workspace-access.md) owns the role and membership model;
[invariants](invariants.md) owns the rest (read-only reads, append-only
evidence, no Redis). Opportunity reads preserve frozen format identifiers,
including identifiers retired from the current catalog.

The audit and Site Health event streams (Server-Sent Events) share one tail,
[`http/event-stream.ts`](../frontend/services/api/src/http/event-stream.ts):
a `Last-Event-ID` (or `last_event_id`) that is not a UUID is refused with 422,
the next page is read only when the client asks for more, and each stream ends
at a maximum duration. A user may hold at most `ABUSE_SSE_STREAMS_PER_USER`
(default 3) open at once on each API instance. The
[stream slot counter](../frontend/services/api/src/http/stream-slots.ts) lives in
process memory, not PostgreSQL: a further stream is refused with 429 and
`Retry-After`, and a slot frees when its stream completes, errors, is cancelled
or the client disconnects. An open stream re-checks its caller's session and
workspace membership every `ABUSE_SSE_ACCESS_RECHECK_SECONDS` (default 30) and
closes once access ends (or the check fails); the client's reconnect then goes
through full authorization. The Agent's live turn stream is not a tail, but it
is sent through the same `eventStreamResponse`.

One parser reads every `Retry-After` header, in the API and in the browser:
[`@citeladder/contracts/retry-after`](../frontend/packages/contracts/src/retry-after.ts).
Only a positive delay or a future HTTP date is advice; anything else means the
caller uses its own backoff.

Backend schemas own the wire contract. Coordinate frontend schemas and API
clients when a DTO changes. [API errors](api-error-contract.md) owns coded
cross-stack error shapes; domain errors are translated at the HTTP boundary,
not leaked as provider bodies or secret-bearing diagnostics.

## Observability

Native structured JSON logging lives in `frontend/services/api/src/logging.ts`;
API errors carry the request ID into server logs and the safe response envelope.