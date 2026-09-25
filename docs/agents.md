# Agent

## Responsibility

The Agent is CiteLadder's one in-app assistant runtime. A user asks a question
or picks up an Action; the Agent gathers persisted CiteLadder evidence, applies
an internal skill and produces one reviewable deliverable that the user refines.
It owns chats, runs, tool and model attempts, outputs and their revisions. It
does not own business evidence, Actions or measurement, and it has no second
knowledge store. It cannot publish, contact third parties, activate prompts,
run crawls or paid pulls, change a customer site, declare implementation or
claim an improvement without new measured evidence. Web research is out of
scope.

## Chats, runs and outputs

The [Agent API](../backend/app/api/agent.py) translates authorized requests
into the [service](../backend/app/domain/agent/service.py). Every chat is pinned
to one project and is the saved unit of work; there is no separate saved-work
store. A user message is appended and queues exactly one
[AgentRun](../backend/app/models/agent.py). Messages are append-only, a chat has
at most one active run, and an idempotency key replays the same run. Reads
return persisted state and never execute a turn.

Admission checks workspace role, the Agent capability and a funding route, then
freezes on the run the runtime/protocol versions, skill and registry versions,
step/tool/size budgets and funding identity. A configuration change never
alters a queued turn. Budgets live in
[Agent configuration](../backend/app/core/config/agent.py).

A chat owns one deliverable of one kind. Agent saves and user edits both append
an immutable [output revision](../backend/app/domain/agent/outputs.py); an edit
against a stale base revision conflicts, restoring an old revision appends a new
one, and a follow-up turn revises the latest revision, including the user's own
edit. Edits and restores are refused while a turn is queued or running, and a
turn whose output moved on from the revision it read saves nothing. Explicitly
picking a skill that produces a different kind of output is refused; start a
new chat for it. Long-form content is outline-first: a draft is written only
after the user explicitly approves an outline revision of that output, whatever
phase the output is in. Ordinary tool and reasoning steps need no approval.
Approving or generating an output is not an implementation declaration.

Idempotency keys are workspace-scoped and bound to the full request: project,
message, skill, Action and context for a new chat. A reused key with a changed
request conflicts, including when two identical requests race.

A targeted output (a page or a planned page) attaches the chat to the existing
[Action](opportunities.md#actions) for that target or creates one, so work on
one target converges instead of multiplying. Other target kinds attach only to
an Action their evidence already created.

## Context and the bounded loop

Before the first model call, each run freezes a
[context manifest](../backend/app/domain/agent/context.py): reviewed business
context, the target page and a bounded related-page set, the attached Action's
diagnosis, any Opportunity, Site Health, Demand or Search Intelligence evidence
the request named, and the project's versioned Agent instructions (audience,
voice, standing requirements and exclusions). The
[context builder](../backend/app/domain/agent/context_builder.py) authorizes
each identifier; missing optional evidence is recorded as an omission, not
filled in. Crawl text remains untrusted observation.

The [runtime](../backend/app/domain/agent/runtime.py) runs a bounded loop of
structured model steps. Each step does exactly one of `select_skill`,
`call_tool` or `respond`. The runtime enforces the step, tool-call, transcript
and output limits; the final step cannot spend a tool call, and a turn that
exhausts its budget stops without saving a partial deliverable. Only evidence
references an executed tool returned, or the attached Action's frozen diagnosis
named, survive; the rest of the context package carries no record references.
Any other `citeladder://` reference is dropped from the evidence list and
replaced in the visible reply and output text.

## Read tools

The [tool catalog](../backend/app/domain/agent/tool_catalog.py) binds the same
read tools [MCP](mcp.md) registers, so the two surfaces cannot advertise
different reads. The chat's project is injected server-side: the model cannot
supply `project_id`, `list_projects` is not offered, and `fetch` refuses a
record from another project. Each call runs as the chat member through MCP's
membership predicate, so a member who loses access reads nothing. The
Agent-only `list_actions`, `get_action` and `list_content_differentiation`
reads are not exposed through MCP. No tool writes.

Each [tool attempt](../backend/app/models/agent.py) records tool, arguments,
status, evidence references, omissions, output hash and latency. `unavailable`
is distinct from a successful read and from a failure. Oversized results are
truncated with an explicit marker, never presented as complete.

Content differentiation reports are persisted by the source-page inspection
pipeline and read only through `list_content_differentiation`. They compare one
current owned page, selected by normalized prompt coverage, with usable inspected
organic results for that prompt: heading topics, table structures and outbound
source domains. Every parity or gap figure carries its inspected-page numerator
and denominator, and "unique" means absent from that inspected set. Organic
comparison rows never create Citation rows, enter Sources counts or affect
Visibility scoring.

## Skills

The [internal skill catalog](../backend/app/core/config/agent_skills/__init__.py)
loads the packaged `SKILL.md` methodologies, one shared operating contract and a
content-format reference that the `content_create` skill draws on one format at
a time. These files are production model input, not coding-agent skills.
Packaging is declared in `backend/pyproject.toml`.

Users may select a skill by name. The catalog endpoint returns only its label,
description, group and output kind; skill bodies are never returned to users or
exposed through MCP. A turn's skill is taken, in order, from the user's pick,
the attached Action's diagnosis, the chat's previous skill, and otherwise the
model's `select_skill` step. Skills are methodologies used by the same runtime,
not separate agents. Changing a skill body changes model input: validate it with
the [skill loader tests](../backend/tests/unit/test_agent_skills.py).

## Worker and funding

The [worker](../backend/app/workers/agent_worker.py) claims runs from the shared
PostgreSQL queue with a lease and a heartbeat. Before each model step it rechecks
lease ownership, cancellation, that the queuing member still holds the run
permission, capability, and the exact customer route/key revision or admitted
platform model, then [commits the dispatch](../backend/app/domain/agent/model_calls.py)
before any network I/O. The terminal write rechecks the member again. A revoked
member, a changed platform model or a lost route ends the turn with its own
code rather than retrying. No transaction is held across provider or tool I/O.

Every model step is funded independently. Platform funding reserves a finite
per-call AI-credit hold from the published policy, then settles it against the
returned usage and releases the excess. A lost or late result settles once as
bounded unknown usage, including after cancellation or a reclaimed lease. If the
historical rate is unavailable, settlement uses the cap frozen at dispatch.
Customer BYOK consumes no platform credits and never falls back to platform
funding. The Agent keeps the persisted `growth_agent` capability, model-route
and credit-rate identifiers so published catalog revisions and customer routes
stay valid; renaming them is a separate billing migration.
[Billing](billing-entitlements.md) owns the ledger.

## Coverage

The [runtime component suite](../backend/tests/component/test_agent_runtime.py)
drives the real worker, runtime, tool catalog and persistence with a scripted
model. It covers evidence-backed Action-linked outputs, follow-up revision of a
user edit, outline-first enforcement, budget exhaustion, refusal of project
selection and unknown tools, single active run, idempotent replay, funding
admission, workspace isolation, per-step settlement and unknown-usage recovery.
