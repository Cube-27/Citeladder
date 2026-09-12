# Growth Agent

## Responsibility

Growth Agent provides bounded explain/roadmap tasks over existing persisted
evidence. It owns task runs, tool attempts and model attempts, not a second
knowledge store or autonomous growth loop. Tools cannot publish, activate prompts,
crawl, sync or mutate external systems. [MCP](mcp.md) exposes the same read
owners to external assistants through a separate authorization surface.

## Task lifecycle

The [Agent API](../backend/app/api/agent.py) submits authorized project tasks
through the [service](../backend/app/domain/agent/service.py). A config-owned
[task policy](../backend/app/core/config/agent.py) bounds task type, allowed tools
and execution. Submission checks workspace role, capability, route and funding
and freezes its idempotency/context identity.

The [worker](../backend/app/workers/agent_worker.py) claims leased runs.
Each registered [tool](../backend/app/domain/agent/tools.py) reads the owning
Site Health, Demand, Opportunities, audit, Performance, referral or integration
projection. Source absence is an explicit unavailable attempt, not a successful
zero or a missing attempt record. Tool errors terminalize with a coded failure.

Tool attempts retain version, source references, omissions, hashes and timing.
Narration uses a bounded evidence package; model dispatch records route/funding,
hold, normalized usage, completeness, deadline, outcome and settlement.
Capability, cancellation, lease ownership and exact BYOK route/key revisions
are rechecked before I/O. Transactions end before network calls. Failures and
expired work follow the configured retry/terminalization policy, and cancellation
does not erase attempt evidence.

## Result contract

[Persisted Agent models](../backend/app/models/agent.py) retain execution state.
Results expose summary, observations, source availability, limitations and
artifact references. Roadmap ordering comes from deterministic persisted
Opportunities, not a model-created score. Missing evidence remains visible.
History is compact; detail has its own projection so a history read need not
return the full provenance payload.

The model can explain evidence, but cannot overwrite it or turn an unsupported
claim into a verified fact. There is no correction or knowledge-memory tool.
[Billing](billing-entitlements.md) owns metered usage; model narration and
read-only tool execution are different operations.

## User surface and extension

The [shell sheet](../frontend/components/layout/agent-sheet.tsx) hosts one
[growth workspace](../frontend/components/agent/growth-agent-workspace.tsx).
Desktop and compact triggers share the persistent controller. Context contains
typed workspace/project/route/date/filter values, not scraped DOM text or
unpersisted page data. Project changes clear route presets. The user sees
persisted progress, result and compact history in the same drawer.

To extend a task, extend its existing config policy and typed read owner.
Do not create a new evidence store, parallel recomputation path or arbitrary
tool loop. [API coverage](../backend/tests/component/test_growth_agent_api.py)
and [worker coverage](../backend/tests/component/test_agent_worker.py) exercise
the submission and execution boundaries.
