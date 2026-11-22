# Agent

## Responsibility

The Agent is CiteLadder's one in-app assistant runtime. A user asks a question,
picks a skill or picks up an Action; the Agent reads persisted CiteLadder
data and either answers, writes a deliverable the user refines, or proposes a
change to the project's data that the user confirms on a card.

It owns chats, runs, model and tool attempts, outputs and their revisions. It
does not own business evidence, Actions or measurement and has no second
knowledge store. It cannot publish, contact third parties, run crawls, change a
customer site or claim an improvement without new measured evidence, and it
changes project data only through [proposed changes](#proposed-changes) the
person confirms; billing, plan, members, API keys, credentials and settings stay
button-only. Its one reach beyond
CiteLadder data is the model provider's hosted [web search](#web-search),
bounded per turn; it never fetches, submits to or changes a page it finds.

Questions, discussion and clarification are replies; they never require a
deliverable, and a question about a saved document leaves it unchanged. The
supplied history is bounded working context. Facts the person gives in a chat
count as confirmed for that chat; they never become reviewed company facts.
Accepting something the Agent offered is a request to do it.

## Chats, runs and outputs

The runtime lives in [`frontend/services/api/src/agent`](../frontend/services/api/src/agent/)
and the HTTP surface in the [Agent API](../frontend/services/api/src/routes/agent.ts).
Its core takes explicit adapters for funding admission, context, the skill
catalog, read tools, model destinations and Action attachment; none has a
permissive default.

Every chat is pinned to one project and is the saved unit of work. Sending a
message appends it and queues exactly one `agent_runs` row;
messages are append-only and a chat has at most one active run. A page chat
(the `optimize_page` workflow) is the exception at creation: it commits its
first message and a `page_fetch` task instead of a run, refuses messages while
the fetch is live, and the fetch queues the first turn only once the page is
read, so a failed fetch is never charged; see
[content optimization](content-optimization.md#page-documents).
The create response's `run` is then null and the chat read's `page_fetch`
reports the fetch. Reads return
persisted state and never execute a turn. The chat list pages by keyset cursor,
can be narrowed to one Action's chats and searches titles and message content
within the project.

Admission checks workspace role, the Agent capability and a funding route, then
freezes on the run the runtime/protocol versions, the skill catalog and tool
registry versions, the budget, the time bound, any workflow and the funding
identity. A configuration change never alters a queued turn; a turn whose skill
catalog, tool registry, protocol or runtime version changed before it ran ends
with `skills_changed` ("the agent was updated; send it again") before any model
call.

A chat holds any number of documents
([decision](decisions.md#agent-mcp-and-public-api)),
numbered in creation order (`agent_outputs.number`, unique per chat) and named
"Document N" to the model and the reader, never by ID. Each has its own kind
and format, and any methodology may write in any chat. Agent saves and user
edits both append an immutable
[output revision](../frontend/services/api/src/agent/outputs.ts) to one
document: an edit against a stale base conflicts, restoring appends a new
revision, and a follow-up revises the latest revision, including the user's own
edit. Edits and restores (`…/outputs/{output_id}/revisions`) are refused while
a turn is queued or running, and a turn whose document moved on from the
revision it read saves nothing.

A document has one draft state: every deliverable is written whole straight
away, and an outline is given in the reply only when asked for. The completion
line states the saved format. Generating an output is not an implementation
declaration: **Mark implemented** declares the attached Action implemented with
the revision on screen; see [declaration](opportunities.md#explicit-implementation-declaration).
The Agent may propose a declaration (`propose_declaration`, for an Action the
turn saw), shown as a card under its reply that opens that dialog prefilled;
only the person's click declares.

A targeted output (a page or a planned page) attaches the chat to the existing
[Action](opportunities.md#actions) for that target or creates one, so work on
one target converges. Other target kinds attach only to an Action their
evidence already created. A document in a chat that already has an Action
carries that Action; when it names another page or topic, the output pane asks
the person once, before offering **Mark implemented**: **Link to /x** re-attaches
the document to that target's Action (created when none exists), **Keep with
this Action** keeps it (`POST …/outputs/{output_id}/target`). The chat keeps its
own Action, and a document whose revision a declaration names stays with that
Action. An Action's status is derived from, never written by, the Agent.

## Context and the bounded loop

Before the first model call each run freezes a
[context manifest](../frontend/services/api/src/agent/context.ts): reviewed business
context, the target page and a bounded related-page set, the attached Action's
diagnosis (for an issue-group Action also its rule, URL count, first 50 URLs
and reference snippet; with `action_url_ids`, at most 50 of its own URLs the
user ticked), the diagnoses of up to five @-mentioned Actions, with
`url_actions_reference` every Action on one URL, any Opportunity,
Site Health, Demand or Keyword research evidence the request named, an exact
upstream output revision, and the project's versioned Agent instructions. The
[context builder](../frontend/services/api/src/agent/context-adapter.ts) authorizes
each identifier; missing optional evidence is recorded as an omission. Crawl
text remains untrusted observation. Issue groups keep complete owner counts
beside a labelled bounded sample, and background pages are dropped before the
selected issue or page. Without a named or handed-off page, the first address
on the project's own site in the request (with or without scheme or `www.`)
is the target page; the target carries a longer body excerpt
(`content_context_target_body_chars`) than related pages, and `read_page_text`
reads its whole crawled copy.

The [runtime](../frontend/services/api/src/agent/runtime.ts) runs a native
tool-calling loop ([decision](decisions.md#agent-mcp-and-public-api)):
the model answers in text or calls tools, and the turn ends when a response
calls none. Its final text is the reply.

- **The conversation.** [`transcript.ts`](../frontend/services/api/src/agent/transcript.ts)
  builds it append-only. The stable prefix is the tools (sorted by name), then
  the system text: the operating contract, the skill catalog and every content
  format. It holds nothing per chat, so providers serve it from cache for every
  chat. Earlier turns of the chat follow, replayed exactly as stored. The turn's
  opening message then adds the frozen context (only when it changed since a
  replayed turn), a list of the chat's documents (number, title, kind, format
  and revision), each document's current text (unless the model saved it whole
  with `save_document` in a replayed turn or that text was already supplied,
  so a user's edit or the result of `edit_document` is always supplied
  exactly), each page document's suggestions with their ids and statuses
  (always, since the person changes them between turns; at most
  `suggestions.turn_list_max`), a pinned methodology (unless already loaded)
  and the request.
- **Memory.** Each run's exchange, including thinking and compaction blocks, is
  saved in `agent_run_transcripts` with the reply in one transaction. A
  transcript is a run record for replay, not a knowledge store: no read returns
  it and it is never shown. Rewriting or dropping an earlier block would miss the
  cache and invalidate later thinking, so replay never edits history. The
  column is `json`, not `jsonb` (which re-sorts object keys), and blocks are
  validated without being rebuilt, so a replayed turn is byte-identical to what
  the provider returned. On Anthropic, server-side compaction bounds a long
  chat; its trigger, `compaction_trigger_tokens` (80 000), keeps every call,
  the compaction step included, below Haiku 5.5's long-context price tier
  (100 000 prompt tokens, B53), and a replayed compaction block is not
  compacted again.
  Chat completions return no compaction, so the oldest whole turns are dropped at
  turn start beyond `replay_max_chars`.
- **Tools.** The model has the [read tools](#read-tools) and seven built-ins
  ([`builtin-tools.ts`](../frontend/services/api/src/agent/builtin-tools.ts)).
  `load_skill` returns a methodology and its saving rules; a turn may switch
  methodology at any time. `save_document` stages a whole deliverable after a
  methodology is loaded, checked against the output and format rules: without
  `document` it adds a new document, and with a document's number it replaces
  that document, which must be of the loaded methodology's kind. `edit_document`
  stages exact `old_string` → `new_string` replacements on one document (this
  turn's staged version, else its latest revision), named by `document` when
  the chat has more than one: each must match exactly once, all apply or none,
  and it writes nothing outside the chat's own documents. Each result starts
  with the document's label ("Document 2: …"). `suggest_edits` stages
  suggestions on a page document, all or none: each names `old_string`
  (matching once), an SEO `field`, or neither for the whole page, with
  `new_string` or a `needs_input` question, and a `rule_id` from the turn's
  `content_rules` context section (or of a Site Health finding open on the
  page), and is resolved to a stored anchor when staged; a later `edit_document` in the same turn moves staged
  suggestions and drops the ones it changed. Every staged document is
  committed as a new revision only with the reply, with the same sources and
  Action attachment, and staged suggestions after it, against that revision. A
  turn that staged only suggestions can still end on them (B60, B69).
  `propose_declaration` stages a declaration proposal, committed on the reply
  (`agent_messages.proposals`), only for an Action that is attached, mentioned
  or returned by a read this turn and that the declaration API would accept now;
  its card keeps the declaration dialog, so the Agent's declare-implemented is
  this proposal rather than a change kind. `propose_change` stages one
  [proposed change](#proposed-changes).
  `show_view` places one of the app's charts or tables under the reply
  (`agent_messages.views`, beside `proposals`): a view kind and its selection
  (market, topic, window, crawl or dataset), never data. The server checks the
  selection against the chat's project with the same owner read the screen
  uses ([`view-reads.ts`](../frontend/services/api/src/agent/view-reads.ts)): a
  record from another project is a correctable error, a read with nothing to
  show answers `unavailable` and places nothing, and at most
  `max_views_per_turn` views go under one reply.
  Questions need no methodology. The skill is
  taken, in order, from the user's pick or workflow, the chat's pin, the
  attached Action's diagnosis, and otherwise the model's `load_skill`; a pinned
  methodology is supplied in the opening message. Fixed handoffs such as Site
  Health's **Ask agent** pin their skill.
- **One response's tool calls.** Built-ins run first, in the order written;
  reads then run concurrently, each recorded as its own attempt keyed by the
  provider's call ID. Every call gets a result in call order. A refused,
  unknown, invalid or over-budget call returns an error result saying how to
  correct it, so the model fixes the call instead of the turn ending. A
  document is saved whole once per turn: a later `save_document` of it, by
  number or by the same title, is refused and the first save kept, so later
  changes go through `edit_document`. Edits apply in call order.
- **Limits.** [Agent runtime configuration](../frontend/services/api/src/config/agent-runtime.json)
  bounds model calls per turn, tool calls per turn, parallel reads per response,
  web searches per turn, result size and the turn's time. Near the cap, a note appended after the tool
  results says how many calls are left; the tools never change, so the cache
  holds. Tool calls in the last call are refused and its text is the reply. A
  last call with no text ends with a fixed reply naming the reads made and
  asking the user to narrow the request, so a turn never finishes without a
  reply.

Thinking counts toward the output cap, so a response cut off by it
(`max_tokens`) is discarded and the same request is sent once more at low
effort as the turn's next call; if that is cut off too the turn ends as
`output_too_long`. A request past the model's context window ends as
`context_too_long`, and a refusal as `model_refused`, after that one call;
asking again would fail the same way. A turn that ends early saves no partial
deliverable and, when it ends failed, is not charged (B58).

### Size budget

[Agent runtime configuration](../frontend/services/api/src/config/agent-runtime.json)
owns one coherent budget. A 40 000-character body bound (user edits share it)
fits the output-token cap in
[gateway settings](../frontend/services/api/src/config/model-gateway.json). Each
read result is bounded to `tool_result_max_chars`, and the frozen context to
`context_package_max_chars`.

### Sources

Sources are derived by the server, not reported by the model. The model has no
`evidence` field. A reply's sources are the records its turn's reads supplied
to the model (a `search` hit and a `fetch`ed record included) plus the attached and mentioned Actions its context supplied and
their findings ([`sources.ts`](../frontend/services/api/src/agent/sources.ts), bounded
and deduplicated). A record the result-size bound dropped from a read, or a
mention or diagnosis the context trimming dropped, is not a source; the tool
attempt still records every record the read returned. A new revision keeps its
predecessor's sources and adds this turn's. Results read in earlier turns stay in the replayed conversation, but
only this turn's reads are its sources.

The model never writes record references for the user. Before saving, the
runtime removes `citeladder://` references and UUIDs from the reply and the
document's title and body, fenced blocks included: no deliverable carries a
machine-readable submission, so Copy and Export never carry a CiteLadder ID.
A UUID the person wrote, in a message of the chat, a paste attached to one,
or typed into a document, is theirs (a form id in pasted HTML) and stays, so
code they supplied is never corrupted. The model names an Action by its exact
title, never a link; the chat read projects each Action a message mentions or
cites and the reply shows an exact title match as a chip with its status.

### Web search

On Anthropic each call may offer the hosted `web_search_20250305` tool (the
basic version, available on every model including Haiku 5.5), declared after
the sorted tools with `max_uses` set to the searches left of the turn's
`max_web_searches` (5), at most `max_web_searches_per_call` (2), which is also
what the call holds. The operating contract tells the model to search only
when the person asks or the answer needs outside facts, never as a routine
step. The tool is omitted once the budget is spent and on the
last call, except that a search the provider left waiting (`pause_turn`, or a
search pending beside client tool calls) is offered one more use so the
continuation stays valid. The definition therefore changes only after a turn
has searched, which costs one cache miss on the next call. `pause_turn` is
continued by sending the conversation back unchanged. Search blocks, including
their encrypted content, are stored and replayed byte-identically, except that
a search the turn's last response left waiting (a `pause_turn` or a pending
search on the last call) is dropped from the saved transcript, so every replayed
tool use has its result.

Searched pages are untrusted observations, never sources: a reply's and a
revision's `web_sources` (`{url, title}`, deduplicated, carried forward like
sources) are kept apart from its CiteLadder records, and each search is a
`search` step with its query. Each model attempt records
`web_search_requests` (null when unknown), and funding holds and settles them
([B53](billing-decisions.md#prompt-runs-and-ai-credits)). The
OpenAI-compatible route offers no hosted search, so a turn there answers from
CiteLadder data alone. Web fetch is not offered.

### Terminal turns

Every terminal turn answers its request. A provider failure that its in-call
retry did not recover (`provider_error`), a turn stopped because the browser
closed or its process stopped (`interrupted`), a turn past its time limit
(`turn_timeout`), cancellation (`cancelled`) and every budget limit append one
code-specific
recovery reply from [`messages.ts`](../frontend/services/api/src/agent/messages.ts)
saying what happened, that nothing was saved, and what to do next. The one
exception is a member who lost access (`access_revoked`, or any other code
once the member can no longer write to the chat), whose turn still settles,
refunds and ends, without a reply. A turn the browser closes after it staged
a document (its `save_document` call already streamed and was accepted) does
not fail: it saves the document with the fixed reply "The chat was closed
before I wrote a summary." and ends succeeded, charged
([B58](billing-decisions.md#agent-charging)), unless that would
leave its transcript ending on unanswered tool or search calls. Stop on a turn
whose lease already lapsed (its instance died) ends it the way lane recovery
does, `interrupted` and refunded (B58), instead of `cancelled`. A model that is
not (or no longer) offered is HTTP 409 `agent_model_unavailable` at admission
and before every call, distinct from 402 `agent_funding_unavailable` (no AI
credits to hold).

A recovery reply records no steps, evidence, web pages or document, while every
reply the model wrote records at least its model call; the thread relies on
that structure (never the reply's words) to show a recovery reply as a failure
callout instead of an answer, with no reply actions. The chat read carries only
the latest run, so only the last turn's callout names how it ended (failed,
stopped at the limit, cancelled); an earlier one is a neutral note. Consecutive
turns repeating the same request with the same recovery reply collapse into one
callout that counts the attempts.

## Read tools

The [tool adapters](../frontend/services/api/src/agent/tool-adapters.ts) bind the
shared TypeScript [MCP](mcp.md) catalogue. The chat's project is injected
server-side: the model cannot supply `project_id`, and `fetch` refuses a record
from another project. `list_projects` and the MCP App views (`render_visibility`,
`render_site_health`, `open_analytics`) are not Agent tools. Each call runs as
the chat member through MCP's membership predicate, and workspace access
(trial and plan) is rechecked before every model call. The Agent and MCP read
the same catalogue; there are no Agent-only reads. A caller's mistake (a bad cursor, window or
filter) is refused with the owner's reason so the model can correct the call.
A paged read whose `limit` takes any size returns the Agent `read_default_limit`
(20) rows when the model names none and accepts at most `read_max_limit` (50),
so a representative sample comes first and more is one cursor away; MCP
clients keep the catalogue's own page sizes, and fixed-size or self-defaulting
limits are unchanged. No read tool writes: the MCP write catalogue and
`confirm_change` are not Agent tools; changes go through
[proposed changes](#proposed-changes).

Each tool attempt is recorded in `agent_tool_attempts`. `unavailable` is distinct from a successful empty or zero read and from failure
or refusal. Oversized results keep whole JSON fields in an incomplete envelope
with named omissions, never a mid-JSON slice presented as complete; paged tools
ask their owner for a smaller page and its exact cursor.

Content differentiation reports compare an owned page with inspected organic
results for one prompt, each figure with its inspected-page denominator; they
never create Citation rows or affect Visibility scoring.

## Proposed changes

One table of change kinds
([`changes/kinds.ts`](../frontend/services/api/src/changes/kinds.ts)) is the single
owner for the Agent and [MCP](mcp.md#changes): each kind holds its permission,
payload schema, one `execute` over the command owner, and a preview the server
builds from the validated payload. Adding a kind is one entry there plus its
name in the Agent's list
([`change-proposals.ts`](../frontend/services/api/src/agent/change-proposals.ts)).
The model gets one built-in, `propose_change` (kind and payload); the kinds,
what each does and their payload shapes (printed from the schemas) are its
description, so the cached tool prefix stays one tool.

A call is checked against the kind's schema, the person's live role and the
kind's permission, then run as a **dry run** (every check and write of the
command, rolled back, with the preview read in the same transaction). A kind
whose preview needs the command's outcome (the imports) reads its own rehearsal,
so the card states what the owner will import, skip or reject. A bad call
or a refusal (a flag the plan lacks included) returns a correctable error;
nothing is staged. A staged proposal
holds the exact payload and the preview without IDs, is bounded per turn by
`max_proposals_per_turn` (declarations count too) and commits with the reply in
`agent_messages.proposals`. Model prose never reaches the card: the title is a
server template with counts only, and every name or text the model, a page or
a person supplied is a row value, clipped and bounded by
`proposal_preview_rows_max` and `proposal_preview_value_max_chars`, so page
text, a paste or a web result cannot dress a card as something else. A paid kind (an audit launch) shows its
spend from the estimate and holds nothing until the click; a launched job is
never awaited, and its card links to where it shows.

Only the person's click executes it:
`POST /api/v1/agent/chats/{chat}/messages/{message}/proposals/{index}/confirm`
(or `/dismiss`) takes no payload from the browser
([`proposal-outcomes.ts`](../frontend/services/api/src/agent/proposal-outcomes.ts)).
In one transaction it holds the member row shared, inserts the outcome row in
`agent_proposal_outcomes` (one decision per message and index, written once,
before the change so its locks come first), runs the kind's `execute` as the clicking
member against their live role and the kind's permission, and records an
`agent.change.<kind>` security event. A concurrent or repeated click gets 409;
a Viewer gets 403 and another workspace 404. A changed world returns the
owner's normal error, rolls the decision back, leaves the card confirmable
and appends a `refused` row with that reason. The card shows open (Confirm and Dismiss, or "Editors only"),
executed, dismissed, or no longer available when its kind is gone.

The Agent learns what happened in its next turn's opening message, never the
cached prefix: each earlier card whose proposal or outcome is newer than the
previous turn is listed by its title and first row (no IDs) as confirmed,
dismissed, refused with the owner's reason, or still open, at most
`proposal_news_max` of them
([`proposalNews`](../frontend/services/api/src/agent/proposal-outcomes.ts)). The
block is stored in that turn's transcript, so replayed history never changes.

## Skills and workflows

### Skills

The [skill catalog](../frontend/services/api/src/agent/skills.ts) loads the packaged
`SKILL.md` methodologies, one shared
[operating contract](../frontend/services/api/assets/agent-skills/operating_contract.md)
and a content-format reference, all formats of which sit in the cached system
text. These files under
[`assets/agent-skills`](../frontend/services/api/assets/agent-skills/) are
production model input, not coding-agent skills, and the API image packages
them read-only. A body may name an application vocabulary as `{{name}}`, which
the loader expands from its owner's listing. The catalog version is a content
fingerprint of every file after expansion, including `workflows.json`, and of
the [content rule catalog](content-optimization.md#suggestions), whose rules
the `content_optimize` methodology applies from its turn's `content_rules`
context section.

The contract and skills are lean
([decision](decisions.md#agent-mcp-and-public-api)): the contract holds the hard
rules once, and a skill never restates it. Where a public plugin skill
mirrors an in-app methodology (`ai-visibility-review` ↔ `ai_visibility`,
`ai-search-change-review` ↔ `measure`, `technical-seo-triage` ↔
`technical_health`, `prompt-discovery` ↔ `prompt_discovery`), a methodology
change lands in both, adapted to the tools each surface has.

The catalog endpoint projects only each skill's ID, label, group, output kind
and description, each workflow's ID and label, and the output kinds' presentation;
skill bodies, workflow skills and formats, and format guidance
are never returned to users or exposed through MCP. Follow-up skill selection
is tri-state: omitted inherits the chat's pin, null clears it (Automatic) and an
ID pins it.

### Workflows

[`workflows.json`](../frontend/services/api/assets/agent-skills/workflows.json),
parsed by [`workflows.ts`](../frontend/services/api/src/agent/workflows.ts), defines
the jobs a chat can start with pinned. Users never pick a workflow directly:
Action handoffs, the page workflow and next steps name one.

Admission accepts `workflow_id`: the workflow's skill becomes
the explicit choice and its format is frozen in the run manifest, so the
methodology and format guidance are present from the first step. A follow-up
inherits the workflow while it still runs that skill.

A workflow whose skill writes a fetched kind (`fetched_kinds` in the
[skill config](../frontend/services/api/src/config/agent-skills.ts): `page`)
starts with a page fetch rather than a turn. `optimize_page` runs
`content_optimize` on a `page` document: the live page, fetched as Markdown
with its SEO `fields`, revision 1 authored `fetch`. The model proposes changes
to it with `suggest_edits` and changes it directly with `edit_document` only
when the person asks; `save_document` refuses it, and edits and restores carry
its fields forward. Its suggestions, and how the person applies them, are in
[content optimization](content-optimization.md#suggestions).

After a fresh deliverable, refinements prefill the composer for review, and
next steps open a new chat with their workflow pinned (a removable skill chip)
and the exact output revision as the brief.

To add a deliverable type, add a format section in `content_formats.md` and/or
a `SKILL.md`, then
add workflow entries and, for a new output kind, its `kinds` presentation. No
browser change is needed. Validate with the
[skill loader tests](../frontend/services/api/test/agent-skills.test.ts).

## Model and effort

A chat holds its model and reasoning effort, chosen in the composer on New chat
and in a chat ([decisions](decisions.md#agent-mcp-and-public-api); [B75](billing-decisions.md#agent-charging)).
The offered Claude models, their labels and the default (Haiku 5.5 at medium)
are `models`, `default_model` and `reasoning_effort` in the
[runtime config](../frontend/services/api/src/config/agent-runtime.json); each
offered model must have its own [price row](../frontend/services/api/src/config/costs.json)
or the API refuses to start. A message that names neither keeps the chat's
pin; admission freezes the model on the run (`requested_model`) and the effort
in its budget, and the gateway is built with that model for the run, so the
platform default and every other model consumer are untouched. Effort can
change on any message. The model can change only until the chat has a stored
transcript: Anthropic accepts thinking and compaction blocks replayed to
another model but may drop that reasoning or fail the kept thinking, and replay
stays byte-identical, so afterwards a different model is 409
`agent_model_locked` and the picker shows the model locked. Sonnet 5.5 and Opus
5.5 have no long-context price tier, so the one compaction trigger stays below
Haiku 5.5's. The OpenAI-compatible route stays in code and is not offered.

## Streaming and the chat

The platform model streams. `DEFAULT_AGENT_BASE_URL` alone chooses the API, so
switching provider or model is configuration (`DEFAULT_AGENT_BASE_URL`,
`DEFAULT_AGENT_MODEL`, `DEFAULT_AGENT_API_KEY`) for every platform model
consumer. The Agent alone takes its model per run instead of
`DEFAULT_AGENT_MODEL` (see [Model and effort](#model-and-effort)):

- `api.anthropic.com` uses the native Messages API through the official SDK
  ([`anthropic.ts`](../frontend/services/api/src/models/anthropic.ts)), with
  adaptive thinking, server-side compaction and one-hour cache breakpoints, so a
  person who pauses between turns still reads the chat from cache; cache-miss
  diagnostics are saved on the model attempt.
- Any other endpoint is OpenAI-compatible chat completions
  ([`openai-conversation.ts`](../frontend/services/api/src/models/openai-conversation.ts)).

Both produce one conversation result, so settlement and the loop never depend
on the provider. Other model consumers keep `complete` and `structured`
unchanged.

The runtime emits display-only events
([`stream.ts`](../frontend/services/api/src/agent/stream.ts)); the settlement
transaction saves the validated message and revision, and partial text is never
persisted.

After accepting a new chat or message, the browser
([`live-turns.ts`](../frontend/lib/agent/live-turns.ts)) opens
`POST …/runs/{run_id}/run` with `Accept: text/event-stream`. The route answers
those events, `done` (with the run view) and `error`, and a keep-alive comment
under proxy idle limits; without that header it answers JSON.

A turn executes only inside that request, exactly once:

- The stream lives in a module, so moving around the app keeps the turn
  running, and several chats can run at once; the chat list marks each chat
  with a running turn.
- Closing the tab or reloading closes the stream and ends the turn as
  `interrupted`; the turn's own limit (`turn_timeout_seconds` in the runtime
  configuration, below the API's request timeout, frozen in the run's budget at
  admission) ends it as `turn_timeout`.
- Turns and interactive audit drives share a per-instance cap
  (`interactiveCapacity` in `config/execution.ts`); a full instance answers 429
  with `Retry-After`; the browser re-posts the run after that delay
  (`AGENT_RUN_RETRY.defaultDelayMs` when the header gives no positive wait), up
  to `AGENT_RUN_RETRY.maxAttempts` (`frontend/lib/config/agent.ts`), and a run
  another request already claimed or ended answers done, so a re-post is safe.
  Any other refusal ends the browser's live view and the persisted read shows
  the run. A stream that delivers no frame, keep-alives included, for
  `AGENT_STREAM_IDLE_MS` (twice `stream_heartbeat_seconds`) is closed, which
  ends the turn as `interrupted`. On
  shutdown the API stops open turns, which end as `interrupted`, before it
  closes.
- A provider failure is retried once within the call
  (`provider_max_attempts`); if that also fails the turn ends as
  `provider_error`. Nothing requeues a turn, so a turn never replays from its
  first call.
- A repeated request finds the run already claimed and never re-executes it.

Each model call's streamed text is its own segment, kept under the earlier
calls' text until the saved reply replaces the turn. Chat polling pauses while the stream is open, the
chat is read again the moment it closes, and another tab or a reload polls with
a backoff.

The full chat and the Dashboard panel share one thread and composer
([`chat-thread.tsx`](../frontend/components/agent/chat-thread.tsx)). A turn's
activity, live or saved, is one collapsed line above its reply text, built by
one function ([`activity.ts`](../frontend/lib/agent/activity.ts)) so the text
stays put when the saved reply replaces the live one; a read's detail is its
`target`, scrubbed of record references and UUIDs, never an ID, enum or budget.
A saved reply's web sources are listed apart from its cited CiteLadder records.
A reply's views ([`thread-views.tsx`](../frontend/components/agent/thread-views.tsx))
render the screen's own component from its persisted read when the thread
opens, so they are always current, each with an **Open in app** link built from
the app's routes; a view whose record is gone or that the member can no longer
read shows as unavailable.
A link in a reply or document opens directly only to the project's site or
owned domains, the turn's or revision's web sources, or CiteLadder itself; any
other link, and every `mailto:`, first opens a "You're leaving CiteLadder"
confirm showing its full address, because a prompt-injected page can make the
model put project data in a link (AR-4). **Retry send** replays a failed
submission with its original idempotency key. Each document is placed after the
reply that last wrote it, labelled "Document N".

A chat with a `page` document (an `optimize_page` chat once its page is read)
opens as the [page workspace](content-optimization.md#the-page-workspace)
instead: the page in an editor beside Suggestions, Outline and SEO, with the
same thread and composer docked under them. Ask AI and Add to context only
write a quoted reference into the composer; nothing is sent until the person
sends it. The workspace loads as its own chunk, only for a page chat.

## Workspace and handoffs

Agent mode holds New chat, Skills, Context and the chat history under
`/agent`; Actions (`/actions`, `/actions/{id}`) is the one list of the
project's work ([Opportunities](opportunities.md)). A long paste becomes a
"Pasted text" attachment, and a text file (CSV, TSV, JSON, NDJSON, Markdown,
plain text) picked with Attach files or dropped on the composer becomes a named
file attachment, read in the browser as strict UTF-8; spreadsheets, PDFs and
documents are refused there with a message to save as CSV or paste the text.
Bounds are in `agent-runtime.json` and listed in the skill catalog's `limits`;
the per-attachment bound fits the largest owner import (500 prompts). The model
receives each attachment as its own block labelled as data, not instructions,
and turns one into an import only through an import change kind built from the
owner's row schema; the operating contract keeps an import to what the file
holds. A pasted link to an Action in the same project becomes a
mention; another project's link stays text.

An Action's page also hands work to a developer outside CiteLadder:
**Prepare developer ticket** (in the
[handoff codec](../frontend/lib/agent/handoff.ts)) writes the Action as
copyable Markdown from its persisted read, and nothing is sent anywhere. Evidence
chips ([evidence](../frontend/lib/agent/evidence.ts)) carry the read's
persisted dates, never resolving a record to find one.

Evidence screens hand work to New chat through the
[handoff codec](../frontend/lib/agent/handoff.ts). Every Action entry point
attaches the Action by id; New chat reads it and writes its `handoff.message`
into the composer, editable, so Send works without typing. The message never
travels in the URL, so browser history and request logs keep ids, not evidence;
an explicit `prompt` parameter from another entry point still wins. The server
fills that message from the evidence of the finding the handoff attaches, with
that finding's approach branch template (`messages` in
[`APPROACH_TREE`](../frontend/services/api/src/config/actions.ts)), or from the
Action's own branch when no finding names a workflow, and falls back to the
Action's label. **Ask agent** carries typed references only (an
Opportunity, a Demand signal, a page or URL, up to 100 Keyword research rows of
one dataset, an issue group, a Site Facts crawl, an exact output revision, or
an objection group, which pins `objection_sources`)
plus an optional question, skill or workflow. The browser never embeds evidence
content beyond that message, and the context builder authorizes every
reference at admission. A content-gap Action's handoff also pins a workflow: a
page to create carries its Opportunity and the `article` workflow, and an
existing content page its URL and the `optimize_page` workflow. Any page
Action whose target is one of the latest crawl's content pages (the Action
read's `editable_page`, computed at read time) opens with its URL and
`optimize_page` too, so its chat becomes the page workspace. The Dashboard
[agent panel](../frontend/components/agent/agent-panel.tsx) is seeded from rows
the screen already holds through the
[panel context](../frontend/lib/agent/panel-context.tsx) and continues in
`/agent/chats/:chatId`.

Prompt discovery ([decision](decisions.md#prompts-and-visibility)) follows the
Prompt builder's steps and never writes prompt text: in the Agent it saves a
short `prompt_plan` whose **Open Prompt builder** link (`/prompts/build`) is
where a person applies it; the Agent gains no write tool. Its public plugin
twin, `prompt-discovery`, runs the steps for MCP clients through the builder's
owners ([MCP](mcp.md#changes)). In both, candidates stay staged and only a
person's Track activates them.

## Worker and funding

The browser's run request claims its run from the shared PostgreSQL queue with a
lease of `lease_seconds` (60 s in the model gateway configuration, three
20-second heartbeats) that the heartbeat renews. Creating a chat does not start
the runner job. The
runner's [agent lane](../frontend/services/api/src/workers/agent-worker.ts) never
executes a turn: it ends as `interrupted` a turn whose lease expired or that no
stream claimed within `unclaimed_grace_seconds`, and settles cancelled turns'
outstanding model attempts. Its next-due time includes held turns' lease
expiry, so a draining runner ends a turn whose instance died within about a
minute. A turn whose own heartbeat gives up ends as `interrupted` in its
request at once, unless recovery or another owner already took the lease.
Before each model call the turn
rechecks lease ownership, cancellation, the member's run permission, the
capability and the admitted platform model,
then [commits the dispatch](../frontend/services/api/src/agent/model-calls.ts)
before any network I/O; no transaction is held across provider or tool I/O.
A read's timeout, Stop and lease loss end its work, not only the wait: once
its signal aborts, the shared read issues no further query.
Settlement survives cancellation and lease loss while replies and revisions
stay fenced, and recovery runs accounting in the same transaction as its
terminal write.

Every model call is funded by its own finite AI-credit hold
([B58](billing-decisions.md#agent-charging)); a balance below
the full hold but above the minimum reply lowers `max_output_tokens`, below it
the call is refused with `funding_unavailable`. A turn refused for funding after it staged a document
saves the document with a fixed reply and is charged. It settles against
returned usage, with cache reads, five-minute and one-hour cache writes and
output (thinking included) at their own rates
([B53](billing-decisions.md#prompt-runs-and-ai-credits)); a lost result
settles once as bounded unknown usage. When a turn ends failed, whether in the
runtime or by lane recovery, its settled debits are refunded once by
append-only ledger refunds while every attempt keeps its tokens and debit
([B58](billing-decisions.md#agent-charging)); a cancelled turn
stays charged, and so does a turn the browser closed after it staged a
document, which saves it. The full output cap is the gateway's
`DEFAULT_AGENT_MAX_OUTPUT_TOKENS` (64 000, about 42 credits at Haiku 5.5
prices; each web search adds 13). In local development, the configured
development login (`DEV_LOGIN_EMAIL`, an active admin) runs as `development` funding with
no hold or debit but the same dispatch evidence. Capability and credit rate are
keyed `agent`; [Billing](billing-entitlements.md) owns the ledger.

## Live evaluation

Live quality and speed are measured outside CI by the operator-only eval,
`pnpm --filter @citeladder/api agent:eval --live --label <name>` (cases in
[`eval-cases.json`](../frontend/services/api/test/fixtures/agent/eval-cases.json),
local development database only; `--report <a>,<b>` compares two runs).
