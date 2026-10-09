# Agent

## Responsibility

The Agent is CiteLadder's one in-app assistant runtime. A user asks a question,
starts a workflow or picks up an Action; the Agent reads persisted CiteLadder
data and either answers or writes a deliverable the user refines.

It owns chats, runs, model and tool attempts, outputs and their revisions. It
does not own business evidence, Actions or measurement and has no second
knowledge store. It cannot publish, contact third parties, activate prompts,
run crawls or paid pulls, change a customer site, declare implementation or
claim an improvement without new measured evidence. Web research is out of
scope.

Questions, discussion and clarification are replies; they never require a
deliverable, and a question about a saved document leaves it unchanged. The
supplied history is bounded working context, and task preferences do not
become reviewed company facts.

## Model destination admission

Customer Agent destinations require acknowledgement of the recipient, transmitted
context categories and the customer's provider terms. The form requires a fresh
acknowledgement on every save (a URL change also clears it); every submitted app
route requires it server-side and appends an actor/workspace/destination/model/revision
receipt. Credential encryption, endpoint validation and verified-route checks
remain with the provider owner.

## Chats, runs and outputs

The runtime lives in [`frontend/services/api/src/agent`](../frontend/services/api/src/agent/)
and the HTTP surface in the [Agent API](../frontend/services/api/src/routes/agent.ts).
Its core takes explicit adapters for funding admission, context, the skill
catalog, read tools, model destinations and Action attachment; none has a
permissive default. Python retains only schema metadata.

Every chat is pinned to one project and is the saved unit of work. Sending a
message appends it and queues exactly one [AgentRun](../backend/app/models/agent.py);
messages are append-only and a chat has at most one active run. Reads return
persisted state and never execute a turn. The chat list pages by keyset cursor,
can be narrowed to one Action's chats and searches titles and message content
within the project.

Idempotency keys are workspace-scoped and bound to the requester and the full
request; a changed request or requester conflicts, and pre-cutover Python keys
return `agent_idempotency_conflict` with `legacy_runtime` details. An
unavailable explicit context identifier returns 404; an incompatible target, 409.

Admission checks workspace role, the Agent capability and a funding route, then
freezes on the run the runtime/protocol versions, the skill catalog and tool
registry versions, the budget, the time bound, any workflow and the funding
identity. A configuration change never alters a queued turn; a turn whose skill
catalog, tool registry, protocol or runtime version changed before it ran ends
with `skills_changed` ("the agent was updated; send it again") before any model
call.

A chat owns one deliverable of one kind. Agent saves and user edits both append
an immutable [output revision](../frontend/services/api/src/agent/outputs.ts): an
edit against a stale base conflicts, restoring appends a new revision, and a
follow-up revises the latest revision, including the user's own edit. Edits and
restores are refused while a turn is queued or running, and a turn whose output
moved on from the revision it read saves nothing. Explicitly picking a skill
that produces a different kind is refused (`agent_skill_kind_conflict`); that
work belongs in a new chat.

Long-form content formats (marked `[long-form]` in
[`content_formats.md`](../frontend/services/api/assets/agent-skills/content_formats.md))
and prompt portfolios are outline-first: a draft is written only after the user
approves an outline revision. Short formats (social posts, definitions, forum
answers) are drafted directly. Approval is a turn tied to the approved
revision, and the completion line states the saved phase and format. Approving
or generating an output is not an implementation declaration: **Mark
implemented** declares the attached Action implemented with the revision on
screen; see [declaration](opportunities.md#explicit-implementation-declaration).

A targeted output (a page or a planned page) attaches the chat to the existing
[Action](opportunities.md#actions) for that target or creates one, so work on
one target converges. Other target kinds attach only to an Action their
evidence already created. An Action's status is derived from, never written by,
the Agent.

## Context and the bounded loop

Before the first model call each run freezes a
[context manifest](../frontend/services/api/src/agent/context.ts): reviewed business
context, the target page and a bounded related-page set, the attached Action's
diagnosis, the diagnoses of up to five @-mentioned Actions, any Opportunity,
Site Health, Demand or Search Intelligence evidence the request named, an exact
upstream output revision, and the project's versioned Agent instructions. The
[context builder](../frontend/services/api/src/agent/context-adapter.ts) authorizes
each identifier; missing optional evidence is recorded as an omission. Crawl
text remains untrusted observation. Issue groups keep complete owner counts
beside a labelled bounded sample, and background pages are dropped before the
selected issue or page.

The prompt is one structured JSON envelope. Stable instructions (operating
contract, methodology, format guidance, tool catalog) come first so providers
can reuse the cached prefix; the per-step action and remaining-budget lines
follow. The current saved revision is always exact. Old history (a message
over its bound is shortened at a character boundary with a marker) and whole
tool observations may be dropped with disclosed markers; serialized JSON is
never sliced. If the exact current revision cannot fit, the turn ends with
`output_context_size_limit` before dispatch.

The [runtime](../frontend/services/api/src/agent/runtime.ts) runs a bounded loop of
structured steps under [protocol v3](../frontend/services/api/src/agent/contracts.ts).
Each step is one of:

- `use_skill`: load a methodology without reading anything;
- `call_tool`: one read, optionally naming `skill_id` to load a methodology in
  the same step;
- `respond`: a nonblank reply and, only for a requested deliverable, an `output`.

Questions need no methodology. A deliverable is accepted only after its
methodology has been supplied: without a selected skill the response schema
forbids `output`, so an auto-routed deliverable is generated once. The skill is
taken, in order, from the user's pick or workflow, the chat's pin, the attached
Action's diagnosis, and otherwise the model's `use_skill`/`skill_id`. Fixed
handoffs such as Site Health's **Ask agent** pin their skill.

Each step has one step specification: the actions, skill IDs and content
formats it allows. The provider is held to it as a strict structured-output
schema (every field present and nullable, every object closed), and the reply
is parsed against the same specification, so the model is never told one shape
and judged by another. Tool arguments travel as `arguments_json`, one JSON
object encoded in a string, because each tool's arguments differ. `format_id`
is offered only for skills whose kind uses content formats; any other skill's
value is dropped. Invalid steps get a bounded repair hint containing only
server-owned instructions and catalog IDs, never the rejected provider text.
The last step may only respond (reply-only when no methodology was selected);
calls with no read budget omit the tool catalog.

A response cut off by the model's output limit (`finish_status: length`) ends
the turn as `output_too_long` after that one call; asking again would be cut
again, so there is no repair call. The runtime enforces step, tool-call,
transcript and output limits, and a turn that exhausts them saves no partial
deliverable.

### Size budget

[Agent runtime configuration](../frontend/services/api/src/config/agent-runtime.json)
owns one coherent budget: a 40 000-character body bound (user edits share it)
fits the output-token cap in
[gateway settings](../frontend/services/api/src/config/model-gateway.json), and
the 150 000-character transcript holds the system prompt plus a bound body.

### Sources

Sources are derived by the server, not reported by the model. The model has no
`evidence` field. A reply's sources are the records its turn's reads returned
plus the findings of the attached and mentioned Actions
([`sources.ts`](../frontend/services/api/src/agent/sources.ts), bounded and
deduplicated). A new revision keeps its predecessor's sources and adds this
turn's. Records read earlier in the chat are offered only as re-read hints,
which spend the turn's read budget.

The model never writes record references for the user. Before saving, the
runtime removes `citeladder://` references and UUIDs from the reply and the
document's title and body; a fenced block is left exact, because a skill's
machine-readable submission may need its IDs. The UI groups sources in plain
words (for example "Search Console query · 3") with links to the screen that
shows them.

### Terminal turns

Every terminal turn answers its request. A failure, exhaustion of retries
(`provider_error`), exhausted lease recovery (`max_attempts_exceeded`),
cancellation (`cancelled`) and every budget limit append one code-specific
recovery reply from [`messages.ts`](../frontend/services/api/src/agent/messages.ts)
saying what happened, that nothing was saved, and what to do next. The one
exception is a member who lost access (`access_revoked`), whose turn ends
without a reply. Failure codes keep their meaning: `trial_expired` and
`access_unresolved` survive from entitlement checks, provider failures are
`provider_error`, validation and storage defects are `internal_error`, and a
malformed step past its repair bound is `protocol_violation`. At admission a
lost or changed model route is HTTP 409 `agent_model_unavailable`, distinct from
402 `agent_funding_unavailable` (no credits and no connected model).

## Read tools

The [tool adapters](../frontend/services/api/src/agent/tool-adapters.ts) bind the
shared TypeScript [MCP](mcp.md) catalogue. The chat's project is injected
server-side: the model cannot supply `project_id`, and `fetch` refuses a record
from another project. `list_projects` and the MCP App views (`render_visibility`,
`render_site_health`, `open_analytics`) are not Agent tools. Each call runs as
the chat member through MCP's membership predicate, and workspace access
(trial and plan) is rechecked before every model step. The Agent-only `list_actions`, `get_action`
and `list_content_differentiation` reads are not exposed through MCP. No tool
writes.

Each [tool attempt](../backend/app/models/agent.py) records tool, arguments,
status, returned record references, omissions, output hash and latency.
`unavailable` is distinct from a successful empty or zero read and from failure
or refusal. Oversized results keep whole JSON fields in an incomplete envelope
with named omissions, never a mid-JSON slice presented as complete; paged tools
ask their owner for a smaller page and its exact cursor.

Content differentiation reports compare an owned page with inspected organic
results for one prompt, each figure with its inspected-page denominator; they
never create Citation rows or affect Visibility scoring.

## Skills and workflows

### Skills

The [skill catalog](../frontend/services/api/src/agent/skills.ts) loads the packaged
`SKILL.md` methodologies, one shared
[operating contract](../frontend/services/api/assets/agent-skills/operating_contract.md)
and a content-format reference supplied one format at a time. These files under
[`assets/agent-skills`](../frontend/services/api/assets/agent-skills/) are
production model input, not coding-agent skills, and the API image packages
them read-only. A body may name an application vocabulary as `{{name}}`, which
the loader expands from its owner's listing. The catalog version is a content
fingerprint of every file after expansion, including `workflows.json`.

The contract and skills are lean: each states the deliverable's shape, the data
to read and a few hard rules (no invented facts, real dates and units,
unavailable is not zero, no record references in user text). They do not
require evidence manifests or per-claim labels. Where a public plugin skill
mirrors an in-app methodology (`ai-visibility-review` ↔ `ai_visibility`,
`ai-search-change-review` ↔ `measure`, `technical-seo-triage` ↔
`technical_health`), a methodology change lands in both, adapted to the tools
each surface has.

The catalog endpoint projects only each skill's ID, label, group, output kind
and description, plus the workflow catalog; skill bodies and format guidance
are never returned to users or exposed through MCP. Follow-up skill selection
is tri-state: omitted inherits the chat's pin, null clears it (Automatic) and an
ID pins it.

### Workflows

[`workflows.json`](../frontend/services/api/assets/agent-skills/workflows.json),
parsed by [`workflows.ts`](../frontend/services/api/src/agent/workflows.ts), defines
the Agent's jobs:

- `groups`: how New chat groups the gallery;
- `workflows`: each with a label, description, `skill_id`, optional `format_id`,
  a starter `prompt` and up to four labelled `inputs`;
- `kinds`: per output kind, the label, the refinements offered after a fresh
  deliverable and the `next` workflows that take the work forward.

The loader rejects unknown skills, groups, output kinds and next-step
workflows, duplicates, and a format that does not exist or whose skill's kind
takes no formats. Admission accepts `workflow_id`: the workflow's skill becomes
the explicit choice and its format is frozen in the run manifest, so the
methodology and format guidance are present from the first step. A follow-up
inherits the workflow while it still runs that skill.

New chat shows the workflows as a grouped gallery; picking one opens a short
form whose required inputs must be filled, and the composed message names each
input. After a fresh deliverable, refinements prefill the composer for review,
and next steps open a new chat with their workflow pinned and the exact output
revision as the brief.

To add a deliverable type, add a format section in `content_formats.md` (mark
it `[long-form]` if it should start from an outline) and/or a `SKILL.md`, then
add workflow entries and, for a new output kind, its `kinds` presentation. No
browser change is needed. Validate with the
[skill loader tests](../frontend/services/api/test/agent-skills.test.ts).

## Streaming and the chat

The platform model streams. `DEFAULT_AGENT_BASE_URL` alone chooses the API, so
switching provider or model is configuration (`DEFAULT_AGENT_BASE_URL`,
`DEFAULT_AGENT_MODEL`, `DEFAULT_AGENT_API_KEY`) for every platform model
consumer, not only the Agent:

- `api.anthropic.com` uses the native Messages API through the official SDK
  ([`anthropic.ts`](../frontend/services/api/src/models/anthropic.ts)). It
  always streams, enforces a step schema as a structured output, and reports
  usage with cached prompt tokens counted as input.
- Any other endpoint is OpenAI-compatible chat completions. With a listener the
  [gateway](../frontend/services/api/src/models/gateway.ts) requests
  `stream: true` with usage on the final chunk and folds the event stream into
  the same completion result; a provider that answers with JSON is read as
  usual. Structured calls send the step schema as a strict `json_schema`
  response format; a destination that rejects it (some customer routes) is
  asked again with the schema in the prompt, and the gateway remembers that for
  the destination.

Both produce one completion result, so settlement and parsing never depend on
the provider. Other model consumers' `structured` calls keep their schema in
the prompt, because their schemas may hold optional fields that strict outputs
refuse. Customer (BYOK) routes are validated as OpenAI-compatible and always
use that API, whatever their host; they buffer and answer in one piece.

The runtime emits `step` events, and for a respond step `text` events carrying
the reply and the document's title and body decoded from the incomplete JSON
([`stream.ts`](../frontend/services/api/src/agent/stream.ts), throttled). They are
display only: the settlement transaction saves the validated message and
revision, and partial text is never persisted.

After accepting a new chat, message or outline approval, the browser
([`live-turns.ts`](../frontend/lib/agent/live-turns.ts)) opens
`POST …/runs/{run_id}/run` with `Accept: text/event-stream`. The route answers
`step`, `text`, `done` (with the run view) and `error` events and a keep-alive
comment under proxy idle limits; without that header it answers JSON. The turn
runs in the API to its own 240-second deadline whether or not the browser stays,
and interrupted turns keep the durable retry path. A repeated request finds the
run already claimed and never re-executes it. Chat polling pauses while the
stream is open and the chat is read again the moment it closes; another tab, a
reload or a dropped stream falls back to polling.

The full chat and the Dashboard panel share one thread and composer
([`chat-thread.tsx`](../frontend/components/agent/chat-thread.tsx)):

- the user's message appears at once, then the reply and document as they are
  written, replaced by the saved versions;
- Stop replaces Send while a turn runs;
- the last turn offers **Try again** (after a failure or stop) or
  **Regenerate**, each a new turn, and **Edit last request**; nothing earlier is
  rewritten;
- the activity line names the current step in plain words with elapsed time;
- **Context used** lists the included context in plain words, without record
  identities, budgets or omission codes.

The [conversation](../frontend/components/agent/conversation.tsx) places the
document after the reply that produced it; each section can be edited or sent
back with a scoped instruction, and History compares revisions. **Retry send**
replays a failed submission with its original idempotency key.

## Workspace and handoffs

Agent mode holds New chat, Actions, Skills, Context and the chat history under
`/agent`. The composer takes `/` to pick a skill and `@` to mention up to five
of the project's Actions. New chat's **Work on an Action** offers **Brief me**,
a `growth_plan` chat mentioning the top open Actions.

Evidence screens hand work to New chat through the
[handoff codec](../frontend/lib/agent/handoff.ts): **Work on this** attaches an
Action; **Ask agent** carries typed references only (an Opportunity, a Demand
signal, a page or URL, up to 100 Search Intelligence rows of one dataset, an
issue group, a Site Facts crawl, or an exact output revision) plus an optional
question, skill or workflow. The browser never embeds evidence content, and the
context builder authorizes every reference at admission. The Dashboard
[agent panel](../frontend/components/agent/agent-panel.tsx) is seeded from rows
the screen already holds through the
[panel context](../frontend/lib/agent/panel-context.tsx) and continues in
`/agent/chats/:chatId`.

Prompts offers **Build with Agent**, preselecting Prompt discovery for a niche
the user names. `read_prompt_portfolio` returns the canonical topics, and a
saved portfolio's rows are tied to those topic IDs. **Review in Prompts**
submits the saved revision to the Prompts owner's admission and quality checks;
the Agent gains no write tool.

## Worker and funding

The [worker](../frontend/services/api/src/workers/agent-worker.ts) claims runs from the
shared PostgreSQL queue with a lease and a heartbeat. Before each model step it
rechecks lease ownership, cancellation, the member's run permission, the
capability and the exact customer route/key revision or admitted platform model,
then [commits the dispatch](../frontend/services/api/src/agent/model-calls.ts)
before any network I/O; no transaction is held across provider or tool I/O.
Settlement survives cancellation and lease loss while replies and revisions
stay fenced, and recovery runs accounting in the same transaction as retry.

Every model step is funded independently. Platform funding reserves a finite
AI-credit hold per call and settles it against returned usage; a lost result
settles once as bounded unknown usage. Customer BYOK consumes no platform
credits and never falls back to platform funding. The configured development
login (`DEV_LOGIN_EMAIL`, an active admin) runs as `development` funding with
no hold or debit but the same dispatch evidence. Capability, customer route and
credit rate are keyed `agent`; [Billing](billing-entitlements.md) owns the ledger.

## Coverage

Native suites in [`services/api/test`](../frontend/services/api/test/) use
scripted models and real PostgreSQL, never live providers:

- `agent-runtime.test.ts`: admission, idempotency, isolation, methodology
  before output, `output_too_long` without repair, outline-first by format,
  carried sources, workflow pinning, recovery replies, budgets and fencing.
- `agent-owner-adapters.test.ts`: tool binding and project pinning, excluded
  tools, re-read hints versus sources, Action attachment and next-step revisions.
- `agent-prompt.test.ts` and `agent-context.test.ts`: prompt assembly under
  size pressure and context resolution.
- `agent-skills.test.ts`: catalog loading, vocabularies, the long-form marker,
  fingerprints and workflow validation.
- `agent-stream.test.ts` and `models.test.ts`: partial-JSON decoding from every
  prefix; streamed and buffered gateway calls settle the same result.
- `agent-cutover.test.ts`: HTTP admission, the SSE route (events, saved reply,
  no re-execution), catalog projection, legacy replay, draining and cancellation.
- `agent-funding.test.ts`: holds, settlement, unknown usage, BYOK and
  development funding.

In the browser, `chat-screen.test.tsx` covers the streamed-then-saved reply,
Regenerate, Stop, section edits, sources and next steps; `new-chat-screen.test.tsx`
the workflow form, pinned next steps, handoffs and commands; and
`agent-panel.test.tsx` the panel.
