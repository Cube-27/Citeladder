# Agent

## Responsibility

The Agent is CiteLadder's one in-app assistant runtime. A user asks a question
or picks up an Action; the Agent gathers persisted CiteLadder evidence and
answers directly, or applies an optional internal skill to a requested deliverable that
the user refines.
It owns chats, runs, tool and model attempts, outputs and their revisions. It
does not own business evidence, Actions or measurement, and it has no second
knowledge store. It cannot publish, contact third parties, activate prompts,
run crawls or paid pulls, change a customer site, declare implementation or
claim an improvement without new measured evidence. Web research is out of
scope.

Questions, discussion and clarification persist as replies without requiring a
deliverable. Selecting a content skill does not require creating an outline;
outline approval applies when the user requests that work. A question about a
saved document preserves its revision. The supplied history is bounded working
context, and task preferences do not become reviewed company facts.

## Model destination admission

Customer Agent destinations require acknowledgement of the recipient, transmitted
context categories and the customer's provider terms. The form requires a fresh
acknowledgement on every save (a URL change also clears it); every submitted app
route requires it server-side and appends an actor/workspace/destination/model/revision
receipt. Credential encryption,
endpoint validation and verified-route checks remain with the provider owner.

## Chats, runs and outputs

### TypeScript runtime

[`frontend/services/api/src/agent`](../frontend/services/api/src/agent/) contains
the TypeScript runtime for the existing Agent tables: transactional chat
admission, append-only messages, leased runs, committed model/tool attempts,
bounded structured turns, persisted reads and output revisions. It uses the
existing workspace policy, generated database types, shared Agent response
contracts and native Agent runtime/gateway policy. Python retains fixed schema
defaults. The API ownership manifest,
all ingress matchers, compose and cloud worker commands select this owner.
The bounded runner executes the Agent lane; Python retains only schema metadata.

The core requires explicit adapters for funding/capacity admission, persisted
content context, a versioned skill catalog, registered read tools, model
destinations and transactional Action attachment. None has a permissive
default. Dispatch and settlement are separate committed transactions; receipt
settlement survives cancellation and lease loss, while replies and revisions
remain fenced. Recovery requires the accounting callback in the same
transaction as retry/reclaim. The worker discovers a bounded workspace set for queued, expired and cancelled
runs and applies native retry-delay policy. Its process supports draining
and graceful shutdown. Existing billing, provider, MCP, Action and persisted
evidence owners supply the adapters. Tests use scripted models and real
PostgreSQL without live provider calls.

The [Agent API](../frontend/services/api/src/routes/agent.ts) translates authorized requests
into the [service](../frontend/services/api/src/agent/store.ts). Every chat is pinned
to one project and is the saved unit of work; there is no separate saved-work
store. A user message is appended and queues exactly one
[AgentRun](../backend/app/models/agent.py). Messages are append-only, a chat has
at most one active run, and an idempotency key replays the same actor's run. Reads
return persisted state and never execute a turn.

Admission checks workspace role, the Agent capability and a funding route, then
freezes on the run the runtime/protocol versions, the skill catalog and tool
registry versions, step/tool/size budgets, the per-call time bound and funding
identity. A configuration change never alters a queued turn, and a turn whose
skill catalog changed before it ran (a deploy in between) ends with
`skills_changed` before any model call. The versioned budget includes prompt,
context, history, tool result, output, reply and protocol-repair limits; an
incompatible historical budget fails before dispatch. Budgets live in
[Agent runtime configuration](../frontend/services/api/src/config/agent-runtime.json)
and [gateway settings](../frontend/services/api/src/config/model-gateway.json).
`AGENT_SKILLS_DIRECTORY` can override the read-only packaged skills directory;
the default resolves relative to the native API source in both development and
the deployed package.

A chat owns one deliverable of one kind. Agent saves and user edits both append
an immutable [output revision](../frontend/services/api/src/agent/outputs.ts); an edit
against a stale base revision conflicts, restoring an old revision appends a new
one, and a follow-up turn revises the latest revision, including the user's own
edit. Edits and restores are refused while a turn is queued or running, and a
turn whose output moved on from the revision it read saves nothing. Explicitly
picking a skill that produces a different kind of output is refused; start a
new chat for it. Long-form content is outline-first: a draft is written only
after the user explicitly approves an outline revision of that output, whatever
phase the output is in. Ordinary tool and reasoning steps need no approval.
Approval is displayed as an action tied to the approved revision; historical
synthetic approval messages remain readable. Completion states the effective
saved phase and content format, including any outline-first coercion. An output
without a selected skill or with an invalid format requires a bounded protocol
repair; it cannot silently succeed without saving the requested deliverable.
Approving or generating an output is not an implementation declaration: the
output pane's **Mark implemented** declares the attached Action implemented
with the revision on screen and then shows what each loop leg is waiting
for; see [declaration](opportunities.md#explicit-implementation-declaration).

While a run is active, the chat read also returns the
[committed steps](../frontend/services/api/src/agent/reads.ts) of every numbered
attempt, projected from its model and tool attempt rows: a call in flight, a
step still being processed, a previous step that returned without a read, or a
read's outcome. Each step retains its model/tool attempt IDs, run attempt and
runtime, protocol, catalog, registry and projection versions. One joined query
reads these committed attempts. The conversation shows
the current attempt's factual activity under the running indicator, with all
committed steps in an expandable disclosure. Earlier attempts never appear as
currently running. Retries restart the bounded loop; `steps_used` is a monotonic
high-water mark, while attempt rows retain actual calls and accounting evidence.

The output reads as a document of sections. Each section can be edited in
place, saved as a user revision with every other section unchanged, or sent to
the Agent with an instruction as an ordinary follow-up turn scoped to that
section. History compares any earlier revision with the current one. Cited
evidence on replies and in Sources links to the screen (or record) that shows
it. After a freshly produced deliverable, optional refinements prefill a message
for review before the user sends it. Later discussion suppresses those suggestions.
The output read names its latest generating reply so the document renders
immediately after that reply, before later discussion. User edits and restores
retain this placement; a newly generated revision moves with its producing turn.
Historical revisions with no message link use their persisted creation time.
New-chat submission keeps its composer in place while the accepted conversation
is prefetched, then opens the populated thread without a launch animation.
Requested refinements revise it in the same chat, and next steps
open a new chat with the skill that takes the work forward, carrying the attached
Action and the exact selected output/revision reference. The next chat freezes
that immutable revision; its source references require re-fetching.

The chat list pages by keyset cursor, can be narrowed to the chats linked to one
Action, searches titles and persisted message content within the project, and
names each chat's target. An Action's workflow status is derived
from, never written by, the Agent; see [Actions](opportunities.md#actions).

Idempotency keys are workspace-scoped and bound to the requester and full request:
project, message, skill, Action and context for a new chat. A reused key with a changed
request or requester conflicts; concurrent identical submissions by one actor
replay once. Actor binding does not change workspace authorization.
After accepting a new chat, message or outline approval, the browser starts a
separate authorized POST scoped to that chat and run. It executes the existing
leased turn in the API, with a 240-second execution deadline, so first progress
does not wait for a worker job to start. Interrupted turns retain the existing
attempt settlement and durable retry path; chat reads only render saved state.
Pre-cutover Python keys return an explicit `agent_idempotency_conflict` with
`legacy_runtime` details, including non-ASCII requests. Historical chats remain
readable; new work requires a new key rather than reinterpreting an old hash.

An unavailable explicit context identifier, including a foreign or removed
origin, returns HTTP 404 from the migrated Agent API. Incompatible authorized
targets return HTTP 409. The retired Python context error used 409 for both;
the TypeScript API preserves absence separately from a conflicting selection.

A targeted output (a page or a planned page) attaches the chat to the existing
[Action](opportunities.md#actions) for that target or creates one, so work on
one target converges instead of multiplying. Other target kinds attach only to
an Action their evidence already created.

## Context and the bounded loop

Before the first model call, each run freezes a
[context manifest](../frontend/services/api/src/agent/context.ts): reviewed business
context, the target page and a bounded related-page set, the attached Action's
diagnosis, the diagnoses of up to five Actions the message @-mentions, any Opportunity, Site Health, Demand or Search Intelligence evidence
the request named, and the project's versioned Agent instructions (audience,
voice, standing requirements and exclusions). The
[context builder](../frontend/services/api/src/agent/context-adapter.ts) authorizes
each identifier; missing optional evidence is recorded as an omission, not
filled in. Crawl text remains untrusted observation. Typed issue-group and Site
Facts references preserve the selected crawl; issue groups retain complete
owner counts alongside a labeled bounded occurrence sample.

The prompt is one structured JSON envelope. The current saved revision remains
exact, including user edits. Old history and whole optional observations or
context sections may be omitted with disclosed markers; serialized JSON is
never sliced. If the exact current revision cannot fit the admitted working
budget, the turn returns `output_context_size_limit` before model dispatch and
saves nothing. An oversized upstream document likewise cannot be silently
substituted with a fragment. Detail reads return a compact Context used
disclosure with selected identities, source provenance, instruction revision,
included sections and limitations; full frozen context remains on the run.

The [runtime](../frontend/services/api/src/agent/runtime.ts) runs a bounded loop of
structured model steps. Each step either reads a tool or responds. Ordinary
questions need no skill selection. A requested deliverable can name `skill_id`
on the same read or response; its methodology is supplied before saving work.
The selected methodology is supplied with its exact skill ID and output kind;
the response schema limits `skill_id` to the selected skill, or to catalog IDs
when none is selected. Invalid steps receive a bounded repair hint containing
only server-owned instructions, never the rejected provider response.
The final call advertises only a response; without a selected methodology it
allows only a reply, reserving selection for an earlier step. Calls with no read
budget omit the tool catalog. The runtime enforces the step, tool-call, transcript
and output limits; the final step cannot spend a tool call, and a turn that
exhausts its budget stops without saving a partial deliverable. Only evidence
references an executed tool returned in an observation actually supplied to
the current model call, or supplied attached/mentioned Action diagnoses named,
survive; the rest of the context package carries no record references. Any other
`citeladder://` reference is dropped from the evidence list and replaced in the
visible reply and output text.
Context sizing drops background pages before the selected issue, retaining exact
issue totals and whole occurrence rows in a disclosed smaller sample. Paged
tools ask their existing owner for a smaller page and its exact cursor until
the result fits; an oversized business overview retains whole smaller evidence
families with named omissions. Tool failures are observations the model can explain;
terminal runtime failures append a recovery reply without changing saved work.
Bounded prior attempt/revision references are navigation hints only. Exact
owner reads reauthorize them and consume the same turn's read budget before
they can support facts or citations; prior model prose is not evidence.

## Workspace and handoffs

Prompts offers **Build with Agent**, preselecting Prompt discovery. The
`read_prompt_portfolio` tool includes a bounded canonical topic list, including
empty topics, and reports topic truncation. A saved prompt portfolio includes
typed core-question rows tied to those IDs. Prompt discovery (skill v4) is the
niche mode: the Generate dialog covers the broad market, and the skill targets
a place, persona, constraint or intent the user names, asking when the request
does not say; a row's optional `targeting` records that niche. **Review in
Prompts** explicitly submits the saved revision to the Prompts owner's admission
and quality checks; users still accept candidates separately. The Agent gains
no write tool.

The composer takes inline commands: `/` picks a skill and `@` mentions up to
five of the project's Actions. Mention selection restores the caret when the
replacement text commits, before subsequent typing. Mentions are typed Action
IDs that admission authorizes to the chat's project (a foreign one refuses the
turn), records on the user message and freezes into the manifest. New chat's **Work on an Action**
disclosure offers **Brief me**, which starts a `growth_plan` chat mentioning the
top open Actions; it runs only when clicked.

The product shell switches between Dashboard and Agent modes, derived from the
route. Agent mode holds New chat, Actions, Skills, Context and the searchable
chat history under `/agent`; the Skills catalog shows what each skill produces,
never its methodology, and Context edits the Agent instructions and the
reviewed brand profile.

The picker distinguishes an explicit skill, the inherited chat workflow or
attached Action, and Automatic. Continue inherits the server-side pin; Automatic
clears it while preserving the deliverable kind and Action context.
The full chat and Dashboard panel follow new messages, revisions and committed
progress only while the reader is near the end; **Jump to latest** resumes
following. The composer permits drafting while a run is active, but cannot send
another turn. Drafts stay in component memory, scoped to the current chat and
workspace, and survive recoverable submission failures. **Retry send** replays
the exact failed submission with its original idempotency key; newer unsent text
is retained. After an accepted run fails or stops, reviewing its request restores
the message and typed Action mentions. If another draft is present, the recovery
button explicitly offers to replace it. Sending starts a new attempt through
normal admission.

Evidence screens hand work to New chat through the
[handoff codec](../frontend/lib/agent/handoff.ts). **Work on this** attaches an
Action. **Ask agent** carries typed references only: an Opportunity, a Demand
signal, a site page or URL, up to 100 Search Intelligence rows of one
dataset, an issue group with crawl and optional page, a Site Facts crawl, or an
exact output revision plus an optional prefilled question; Site Health, Demand
and Search Intelligence offer it. The browser never embeds evidence content, and parsing
drops a malformed id or URL rather than guessing. The context builder resolves
and authorizes every reference at admission, so a stale or foreign id
fails there. Composer chips let the user remove a reference before sending.

On every Dashboard screen the top bar also opens the
[agent panel](../frontend/components/agent/agent-panel.tsx), a right-side chat
over the current screen. Screens seed it through the
[panel context](../frontend/lib/agent/panel-context.tsx) from rows they already
hold: the open or visible Search Intelligence rows as typed references, and
the open Site Health issue or Site Facts as the same typed references used by
the full-screen link. Nothing is read from the DOM. The panel uses the same chats,
runs and outputs; **Open in Agent** (or opening the output) continues the chat at
`/agent/chats/:chatId`.

## Read tools

The [tool adapters](../frontend/services/api/src/agent/tool-adapters.ts) bind the
shared TypeScript [MCP](mcp.md) catalogue. The chat's project is injected server-side: the model cannot
supply `project_id`, `list_projects` is not offered, and `fetch` refuses a
record from another project. Each call runs as the chat member through MCP's
membership predicate, so a member who loses access reads nothing. The
Agent-only `list_actions`, `get_action` and `list_content_differentiation`
reads are not exposed through MCP. No tool writes.

Each [tool attempt](../backend/app/models/agent.py) records tool, arguments,
status, evidence references, omissions, output hash and latency. `unavailable`
is distinct from a successful empty/zero read and from failure or refusal.
Availability semantics belong to each shared tool definition; unexpected or
missing required state is a contract failure. Oversized generic results retain
whole JSON fields in an incomplete envelope with omissions and no citation
grants, never a mid-JSON slice presented as complete.
Exact record fetches use continuation documents sized to the Agent's read
budget and retain the fetched record reference for citations. Page diagnoses
follow the analysis's persisted evaluation IDs, including final revisions.

Content differentiation reports are persisted by the source-page inspection
pipeline and read only through `list_content_differentiation`. They compare one
current owned page, selected by normalized prompt coverage, with usable inspected
organic results for that prompt: heading topics, table structures and outbound
source domains. Every parity or gap figure carries its inspected-page numerator
and denominator, and "unique" means absent from that inspected set. Organic
comparison rows never create Citation rows, enter Sources counts or affect
Visibility scoring. The `ai_visibility` skill owns the methodology for reading
them.

## Skills

The [internal skill catalog](../frontend/services/api/src/agent/skills.ts)
loads the packaged `SKILL.md` methodologies, one shared operating contract and a
content-format reference that the `content_create` skill draws on one format at
a time. These files are production model input, not coding-agent skills.
The [API image](../frontend/services/api/Dockerfile) packages the same files from
[`frontend/services/api/assets/agent-skills`](../frontend/services/api/assets/agent-skills/)
as read-only assets in the API package. The catalog version is a
content fingerprint of those files after vocabulary expansion. A body may name
an application-owned vocabulary as `{{name}}`, which the loader expands from its owner's one listing
(prompt buyer stages and intents), so the list is never hand-copied. The loader
bounds descriptions and bodies and rejects unknown vocabularies and duplicate
metadata. The read-tool registry authorizes every executed tool.

Users may select a skill by name through the shared composer picker; `/` opens
that same control and returns focus to the message on dismissal or selection.
The catalog endpoint explicitly projects only its ID, label,
description, group and output kind; skill bodies are never returned to users or
exposed through MCP. A turn's skill is taken, in order, from the user's pick,
the chat's previous skill, the attached Action's diagnosis, and otherwise the
model's optional `skill_id` on a read or response. Follow-up selection is
tri-state: omitted inherits,
null clears the explicit pin, and an ID pins it. Automatic still respects the
existing deliverable kind and attached Action. Model selection receives public
description/output metadata; capabilities never imply automatic specialist
invocation or browsing. Skills are methodologies used by the same runtime,
not separate agents. Changing a skill body changes model input: validate it with
the [skill loader tests](../frontend/services/api/test/agent-skills.test.ts).

## Worker and funding

The [worker](../frontend/services/api/src/workers/agent-worker.ts) claims runs from the shared
PostgreSQL queue with a lease and a heartbeat. Before each model step it rechecks
lease ownership, cancellation, that the queuing member still holds the run
permission, capability, and the exact customer route/key revision or admitted
platform model, then [commits the dispatch](../frontend/services/api/src/agent/model-calls.ts)
before any network I/O. The terminal write rechecks the member again. A revoked
member, a changed platform model or a lost route ends the turn with its own
code rather than retrying. No transaction is held across provider or tool I/O.

Every model step is funded independently. Platform funding reserves a finite
per-call AI-credit hold from the published policy, then settles it against the
returned usage and releases the excess. A lost or late result settles once as
bounded unknown usage, including after cancellation or a reclaimed lease. If the
historical rate is unavailable, settlement uses the cap frozen at dispatch.
Customer BYOK consumes no platform credits and never falls back to platform
funding. The deployment's provisioned development login (the configured
`DEV_LOGIN_EMAIL` as an active admin, with a configured login password) runs the
platform model as `development` funding: no published rate, hold or debit, but
the same committed dispatch evidence, rechecked at every step. The Agent's capability, customer model route and credit rate are all
keyed `agent`.
[Billing](billing-entitlements.md) owns the ledger.

## Coverage

The TypeScript adapters in
[`src/agent`](../frontend/services/api/src/agent/) bind the existing billing
ledger and provider owners. Its skill loader reads these same packaged files,
expands native config vocabularies and fingerprints the actual model inputs.
The TypeScript image includes them as read-only assets.

The [runtime component suite](../frontend/services/api/test/agent-runtime.test.ts)
drives the real worker, runtime, tool catalog and persistence with a scripted
model. It covers evidence-backed Action-linked outputs, follow-up revision of a
user edit, outline-first enforcement, budget exhaustion, the frozen skill catalog and
time bound, live step progress, refusal of project
selection and unknown tools, single active run, idempotent replay, funding
admission and workspace isolation. The [funding suite](../frontend/services/api/test/agent-funding.test.ts)
covers real ledger settlement and unknown usage; the
[cutover suite](../frontend/services/api/test/agent-cutover.test.ts) covers HTTP
admission, revisions, legacy replay, worker draining, cancellation and expiry.
