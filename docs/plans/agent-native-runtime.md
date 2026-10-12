# Agent native runtime

Started 2026-10-12 from an owner review of the Agent ("not really an agent;
brittle and slow because it is constrained"). Owner document:
[Agent](../agents.md). Constraints: invariants 10–13 and 16, the
[billing decision log](../billing-decisions.md) rule that money rules need an
Owner entry before code, and the greenfield policy (baseline edits plus a local
reset; no data migrations; versions stay at 1).

## Objective

The Agent behaves like a modern chat agent. It answers quickly and streams from
the first token. It reads several things at once and remembers what it read
earlier in the chat. A malformed call is something the model corrects, not a
reason to end the turn. Users choose the model and the reasoning depth. The
guardrails stay: workspace authorization, PostgreSQL-owned state, per-call
funding committed before network I/O, server-derived sources, read-only tools
and no autonomous action.

## Owner decisions (2026-10-12)

| ID | Decision |
|---|---|
| A1 | Build a native tool-use loop now; no agent framework (LangGraph, Claude Agent SDK). |
| A2 | The Agent's providers are Anthropic or OpenAI. Gemini is not now. Customer (BYOK) Agent routes stay removed. |
| A3 | Default model Claude Haiku 5.5 at reasoning effort medium. Users may pick Haiku 5.5 or Sonnet 5.5. |
| A4 | Sonnet 5.5 is offered on Growth and Scale, not on the trial or Starter. This is a current business decision, kept in plan configuration so it can change without code (see F11). |
| A5 | The model and reasoning choice is per chat and changeable on any message. Each run freezes what was selected. |
| A6 | Users see reasoning levels Low, Medium (default) and High. |
| A7 | Thinking summaries stream into the activity line, collapsed by default, and are not shown again after the turn. The server may store thinking blocks for replay; customers are not shown all of it. |
| A8 | Later improvements (PR 3) are written as two options for the owner: Anthropic Managed Agents or the native runtime. |

## Verified findings

From an audit of `services/api/src/agent`, `src/models`, the Agent routes and
contracts, the frontend Agent surfaces, and the docs and marketing.

### Speed

- **F1. No prompt caching.**
  [`anthropic.ts`](../../frontend/services/api/src/models/anthropic.ts) sends no
  `cache_control`, so every step pays full price and full prefill. Up to
  150 000 characters are re-sent per step.
- **F2. The prompt is not prefix-stable.**
  - `runtime.ts` `prompt()` rebuilds the system string every step. It embeds
    `Steps remaining`/`Reads remaining`, the final-step text, the conditional
    tool catalog, the skill body or skill list, and the re-read hints.
  - `prompt.ts` packs history and observations into one JSON user message and
    trims them from the front.
  - Caching alone would not hit.
- **F3. Extra round trips.**
  - `use_skill` costs a whole model call.
  - Reads are one per step and sequential.
  - The reply streams only on the final `respond` step.
  - Haiku 5.5 thinks by default (adaptive, display omitted), so the user waits
    in silence.
- **F4. The deliverable is written inside a JSON string.**
  [`stream.ts`](../../frontend/services/api/src/agent/stream.ts) decodes partial
  JSON to show it live.

### Correctness and brittleness

- **F5. The model cannot see its own earlier steps.** The transcript keeps only
  `Tool X: status` plus the result. It does not keep the arguments the model used
  or its reasoning.
- **F6. Follow-ups lose evidence.**
  - History is the last 12 messages, each cut to 4 000 characters.
  - Earlier tool results come back only as "re-read hints", which spend this
    turn's 6-read budget.
- **F7. The model fills in a homemade form instead of calling tools natively.**
  - Each step is one closed object (`action`, `skill_id`, `tool`,
    `arguments_json`, `reply`, `output`).
  - Tool arguments are not checked per tool by the provider.
  - Two malformed steps end the turn with `protocol_violation`.
  - The last of 8 steps is forced to respond with whatever evidence it has.
- **F8. Results and budgets are small for analytics work.** The limits are
  `max_steps` 8, `max_tool_calls` 6 and `tool_result_max_chars` 12 000
  ([agent-runtime.json](../../frontend/services/api/src/config/agent-runtime.json)).

### Constraints the rebuild must respect

- **F9. One platform model is hard-wired.**
  - `funding.ts` (admission and `recheck`), `agent/models.ts` and
    `model-calls.ts` all throw `model_changed` when `run.requested_model` differs
    from the gateway model.
  - `gatewaySettings().model` (`DEFAULT_AGENT_MODEL`) is shared by every other
    model consumer and must not change meaning.
- **F10. Pricing gaps.**
  - [ai-credits.json](../../frontend/services/api/src/config/ai-credits.json) has
    only a Haiku 5.5 row. `modelPrice()` returns null for any other model, so a
    Sonnet call is refused at hold time.
  - Anthropic cache-write tokens are folded into input at the base price; the
    API bills them at a premium.
  - Thinking tokens arrive inside `output_tokens`.
  - Haiku 5.5's list price rises fivefold above 100K prompt tokens ($0.50
    input, $2.50 output), and the price row has a single rate.
- **F11. The Agent is already paid-only.**
  - The `agent` capability is granted only to Growth and Scale.
    `catalog-authoring.ts` validates that tier 1 has no Agent, and the public
    trial grants none.
  - So today every workspace that can run the Agent may use Sonnet (A4). A4 is
    a business decision that can change, so PR 2 gates each model by its own
    plan list in config rather than relying on this.
- **F12. Commit before network I/O.**
  - `ModelCalls.dispatch` reserves the hold and inserts the
    `agent_model_attempts` row (unique per `run_id, run_attempt, ordinal`) and
    commits before `complete`.
  - `receipt` settles in its own transaction.
  - The new loop keeps one model attempt per model call.
- **F13. One tool row per step.**
  - `uq_agent_tool_attempt_slot (run_id, run_attempt, ordinal)` allows one tool
    attempt per step.
  - `reads.ts` `progress()` joins model and tool attempts on `ordinal`.
  - Parallel tool calls need a per-call key.
- **F14. The terminal commit is atomic.** `finish` writes the reply message, the
  output revision (fenced on its base revision) and `terminalize` in one
  transaction. Recovery copy promises "nothing was saved". `save_document`
  must stage, not commit.
- **F15. The other model consumers use a different path.** Buyer prompts,
  shelf, perception, project research and prompt generation use `structured()`
  through `billing/metering.ts` `meteredGateway`. Their request and response
  behaviour must stay byte-identical. The new call is a sibling of `Complete`,
  not a widening of it.
- **F16. One BYOK leftover remains in code.**
  - `createModelGateway`'s `{ api: 'openai_compatible' }` option is used only by
    `models.test.ts`.
  - [agents.md](../agents.md) ("Model destination admission", customer route
    and BYOK clauses) and
    [backend-architecture.md](../backend-architecture.md) (the OpenAI-only
    gateway description) are stale.
  - Public copy still offers "your own OpenAI-compatible API" for the Agent
    (`lib/marketing-content/platform-pages-improve.ts`).
- **F17. The frontend keeps one step and one text per run.**
  - `lib/agent/live-turns.ts` keeps one `step` and one cumulative `text`
    snapshot per run, so parallel reads would overwrite each other.
  - The request schemas in `packages/contracts/src/agent.ts` are `.strict()`.
  - The frontend request types are hand-duplicated in `lib/api/agent.ts` and
    `use-chat-turns.ts`.
  - Chats start from four call sites: `NewChat`, `PanelStart`, `useFollowUp`,
    and `WorkflowStart`/`BriefingCard` through `create.start`.
- **F18. Tool schemas differ.** `ToolRegistry.catalog()` emits
  `z.toJSONSchema(arguments)` without `io: 'input'`, while the registry version
  hash in `tool-adapters.ts` uses `io: 'input'`.

## Design

### Model call

A new gateway method, `converse`, sits beside `complete` and `structured`. It
calls `assertMetered`, like every gateway method.

- **Anthropic** (`@anthropic-ai/sdk` 0.131.0 already types everything needed):
  - `messages.stream` with `tools`, `thinking: {type: "adaptive", display: "summarized"}`
    and `output_config.effort`;
  - an explicit `cache_control` breakpoint after the stable prefix, plus
    top-level automatic caching for the conversation tail;
  - parallel `tool_use`, and `eager_input_streaming` on `save_document` so the
    document streams.
- **OpenAI chat completions:**
  - `tools` and parallel `tool_calls`, with `reasoning_effort`;
  - the stream parser reads `delta.tool_calls`;
  - a tool-call answer may have empty `content`.
- **One result shape:** text, tool calls, the raw assistant blocks for replay,
  stop reason, and usage including cache writes and thinking tokens.
- **Stop reasons:**
  - `max_tokens`/`length` ends the turn as `output_too_long`.
  - `refusal` gets its own recovery reply.

### Loop

`AgentRuntime.turn` becomes a loop over a conversation that is only appended to
during the turn:

1. **Prompt layout.**
   - Stable prefix: tools (sorted), then the operating contract, then skill
     descriptions, then the format preamble. This is the first cache
     breakpoint, shared by every chat.
   - Then the frozen context manifest and the bounded prior-turn transcript.
   - Then the user's request.
   - A pinned skill (user pick, workflow, chat pin, Action diagnosis) is
     injected as a completed `load_skill` exchange at the start, so its body is
     present from the first call.
2. **Each model call:**
   - recheck access;
   - `dispatch` (hold, attempt row, commit);
   - stream;
   - `receipt`.
3. **Tool calls from one response** run concurrently, each with its own
   `agent_tool_attempts` row (per-call key). All results return in one user
   message.
   - Refused, unknown, invalid or over-budget calls get an `is_error` result
     carrying the owner's reason, so the model can correct the call.
   - There are no repair hints and no `max_protocol_errors`.
4. **Built-in tools:**
   - **`load_skill({skill_id})`** returns the methodology and format guidance.
     It refuses a different kind once a deliverable exists ("start a new
     chat").
   - **`save_document({title, body, phase, format_id, target_kind, target})`** is
     validated by the existing `outputSchema` plus format, skill and outline
     rules, and returns what was staged.
     - It is refused until a skill is loaded.
     - The phase is forced to `outline` while an outline is unapproved.
     - It runs at most once per response. A second `save_document` in the
       same response gets an `is_error` result asking for one document, so
       completion timing never picks the winner. Responses are sequential, so
       across responses the latest staged version wins.
     - The staged document is committed in `finish` with the reply in one
       transaction. F14's fencing and recovery copy stay true.
5. **End of turn.**
   - The turn ends when the model stops calling tools.
   - The final text is the reply. It is scrubbed of record references and
     bounded as today.
   - Limits come from config: model calls per turn, tool calls per turn,
     parallel calls per response, result size and turn timeout. Proposed: 16,
     24, 6, 16 000 characters, unchanged 840 s.
   - At the cap, the model gets one final call whose appended instruction says
     to answer now; any tool call in that response is refused. The tools stay
     the same so the cache holds; see Prompt caching.
   - If that final response has no text, the turn ends with a fixed
     limit reply that names the reads made and asks the user to narrow the
     request. A turn never finishes without a reply.

### Memory across turns

- Each run's exchange is persisted at `finish` in a new table,
  `agent_run_transcripts`.
  - It holds one row per run with the assistant and tool blocks as `jsonb`
    exactly as the provider returned them, including thinking blocks and their
    signatures.
  - It is workspace and project scoped, cascades with the run, and is written
    in the same transaction as the reply.
  - Stored thinking blocks are replay input only. They are never shown or
    returned by any read (A7, O8).
- **The chat's conversation is only ever appended to, across turns as well as
  within one.**
  - Haiku 5.5 and Sonnet 5.5 keep previous-turn thinking blocks. Deleting a
    thinking block, or editing an earlier tool result, counts as a history
    edit: it misses the cache from that point and invalidates every later
    thinking block. On accounts created on or after 2026-08-31 it is a 400.
  - So replay never strips, stubs or rewrites earlier blocks.
- **Bounding a long chat.**
  - Anthropic: server-side compaction (beta `compact-2026-01-12`, supported on
    Haiku 5.5 and Sonnet 5.5). Its trigger is set in config below Haiku 5.5's
    100K price tier (B53). The returned compaction blocks are persisted and
    replayed as the API requires.
  - OpenAI: chat completions return no reasoning blocks, so the oldest turns
    are dropped client-side at turn start.
  - Before PR 1 merges, check compaction and preserved thinking together with a
    real Haiku 5.5 chat that crosses the trigger.
- A model switch between turns (PR 2) is not an edit. The API drops blocks the
  new model cannot read, so that one turn starts with a cold cache.
- Re-read hints, `history_max_messages`, `history_message_max_chars`,
  `prior_evidence_max_refs` and `transcript_max_chars` are removed.
- Sources stay server-derived: the reads executed this turn, plus carried
  revision refs, plus Action findings.

### Prompt caching

Caching is a prefix match over `tools`, then `system`, then `messages`. Any
changed byte invalidates everything after it.

- **Breakpoints.**
  - One explicit `cache_control` breakpoint on the last system block. It covers
    the tools (sorted by name), the operating contract, the skill catalog and
    the format preamble.
  - This prefix is identical for every chat. Caches are per Anthropic
    workspace, so all CiteLadder traffic shares it.
  - Top-level automatic caching covers the growing conversation.
- **Nothing variable goes in `system`.** No dates, counters, budgets, project
  data or conditional sections. Per-chat context, the pinned skill and any
  reminder are message content after the prefix.
  - A limit reminder near the cap is a text block appended after that step's
    tool results and never deleted.
  - At the cap, the final no-tools call uses that text, not a changed
    `tool_choice` or tool list, which would invalidate the messages cache.
- **Thinking and effort are fixed for a run.** Changing effort between turns
  invalidates the messages cache. PR 2 may use per-message effort (beta
  `mid-conversation-output-config-2026-07-01`, Haiku 5.5 and Sonnet 5.5 with
  thinking on) to avoid that; otherwise the switching turn is a cold read.
- **TTL.** The 5-minute TTL is the default: tool loops restart well inside 5
  minutes, and live traffic keeps the shared prefix warm. A user who replies
  after 5 minutes pays one cold read of the conversation. Measure before paying
  2× writes for the 1-hour TTL.
- **Verification.**
  - Every model attempt records `cache_read_input_tokens` and
    `cache_creation_input_tokens`.
  - The eval and the runtime logs check the healthy pattern: reads grow each
    step, and writes stay near the newly appended tail.
  - Cache diagnostics (beta `cache-diagnosis-2026-04-07`) is the debugging tool
    when reads collapse.
- **OpenAI.**
  - Caching is automatic for prompts of 1024 tokens or more, with the same
    prefix rules.
  - `prompt_cache_key` (one key for the shared prefix) improves routing.
  - Cached tokens arrive in `prompt_tokens_details.cached_tokens`, which the
    gateway already reads.
  - Confirm the current OpenAI caching docs when implementing.

### Streaming contract

- `agentTurnEventSchema` gains:
  - `reply_delta {text}`;
  - `document_delta {title?, body?}`;
  - `thinking {text}` (summaries, display only);
  - `tool {call_id, tool, status}` (started, completed, unavailable, refused,
    failed).
- `step` becomes the model-call heartbeat. `text` is removed.
- `done` and `error` are unchanged.
- The saved reply still replaces the streamed text when the stream closes.

### Model and reasoning choice (PR 2)

- **Config.** An Agent model allow-list in config, each entry with:
  - provider;
  - price row key;
  - the plans allowed to use it: Haiku on every plan with the Agent, Sonnet
    on Growth and Scale only (A4). The model's own plan list gates it, not the
    `agent` capability alone, so Sonnet stays off Starter even if Starter later
    gains the Agent;
  - labels, and the effort mapping Low/Medium/High → provider effort or
    `reasoning_effort`.
- **Chat and run columns.**
  - `agent_chats` gains `model` and `reasoning_level`.
  - Create and message requests may set them; omitted inherits the chat's
    value.
  - The run freezes `requested_model` (existing column) and `reasoning_level`
    (new column).
- **Checks.**
  - Admission and dispatch check the allow-list and capability instead of the
    `model_changed` equality checks.
  - Model and effort are added to the idempotency fingerprint.
  - A model removed from config refuses the queued run with the existing
    `agent_model_unavailable`.

## PRs

Three PRs, built in order. Each merges and syncs `main` before the next
branches, and each leaves the repository releasable.

### PR 1 — Native loop, streaming and memory (Haiku 5.5 at medium, no picker)

**Prerequisite (met):** caching changes what a call costs, so its pricing is
decided in [B53](../billing-decisions.md#agent-native-runtime-2026-10-12).

**Backend**
- **Gateway** ([gateway.ts](../../frontend/services/api/src/models/gateway.ts),
  [anthropic.ts](../../frontend/services/api/src/models/anthropic.ts),
  [http.ts](../../frontend/services/api/src/models/http.ts)):
  - add `converse` for both providers;
  - leave `complete`/`structured` byte-identical;
  - delete the `api: 'openai_compatible'` option and its test case (F16).
- **Funding and model calls** (`model-calls.ts`, `funding.ts`, `agent/models.ts`):
  - the request type becomes messages plus tools;
  - a hold-size function covers tool and message blocks;
  - `request_hash` covers the whole serialized request and `output_hash` the
    block list;
  - usage records cache-write and thinking tokens (thinking tokens go in
    `reasoning_tokens`);
  - settlement follows B53.
- **Runtime.**
  - Rewrite `runtime.ts` per the loop design.
  - Delete from `contracts.ts`: `Step`, `StepSpec`, `stepSchema`,
    `stepJsonSchema`, `parseStep`, `AgentProtocolError` and `arguments_json`
    decoding.
  - Delete `prompt.ts` and replace it with append-only conversation assembly
    (stable prefix, replayed transcripts, compaction blocks).
  - Delete the `stream.ts` JSON decoder and keep `TurnEvents`.
- **Tools.**
  - Add `load_skill` and `save_document` beside the registry. They are not
    read tools, so the registry type gains a small "built-in" kind.
  - Fix F18.
  - **Tool-quality pass** over the shared MCP read catalogue: descriptions say
    when to use each tool and what it returns; argument names are unambiguous;
    caller-error text says how to fix the call; results stay compact.
    - This changes public MCP text too.
    - Plugin skills keep parity (the owner-adapter test enforces tool names).
- **Persistence** (edit `migrations/0001_baseline.sql`, regenerate
  `db-schema.ts`, owner resets the local DB):
  - `agent_tool_attempts` gains `call_id`, and its unique key becomes
    `(run_id, run_attempt, ordinal, call_id)`;
  - new table `agent_run_transcripts`;
  - `agent_model_attempts` gains `cache_write_input_tokens`. Today cache writes
    are folded into `input_tokens`, so B53 cannot be applied or audited;
  - `reads.ts` progress groups tool calls under their model call.
- **Config** ([agent-runtime.json](../../frontend/services/api/src/config/agent-runtime.json)):
  - new turn limits and the replay token budget;
  - remove `max_protocol_errors`, `history_*`, `prior_evidence_max_refs` and
    `transcript_max_chars`;
  - `budgetSchema` follows;
  - version strings stay at 1 (greenfield reset).
- **Packaged inputs.** Rewrite
  [operating_contract.md](../../frontend/services/api/assets/agent-skills/operating_contract.md)
  for tools (no `use_skill`, `output` or `skill_id` wording, plus a
  parallel-reads instruction). Check SKILL.md files for protocol wording.
- **Copy.** In `messages.ts` recovery replies: remove `protocol_violation` and
  add `model_refused`. Also update the error-code contract and route mapping.

**Frontend**
- `packages/contracts/src/agent.ts`: the new event union, and `agentStepSchema`
  and `agentRunStepSchema` gain `call_id`.
- `lib/agent/live-turns.ts` becomes a reducer:
  - accumulated reply and document deltas;
  - a per-call tool map;
  - the latest thinking summary.
  - Add a unit test for it.
- `components/agent/conversation.tsx`:
  - `LiveReply` renders the reply and document deltas.
  - `RunningState` shows the parallel reads (for example "Reading Search
    Console queries…" and "Reading site health…").
  - A collapsible thinking summary, using the `Disclosure` primitive, collapses
    when the saved reply arrives.
  - The message `<details>` summary counts model calls and reads.
- `lib/agent/vocabulary.ts`: labels for tool states and model calls; remove the
  `protocol_violation` copy.

**Tests** (scripted native-tool models, real PostgreSQL, per the
test-behaviour skill)
- Rewrite `agent-support.ts` `scripted()` to emit text, `tool_use` and
  `save_document` blocks.
- `agent-runtime.test.ts`:
  - parallel reads recorded per call;
  - an invalid argument returned as an error result, then recovered;
  - `save_document` refused before a skill, forced to outline, committed only
    with the reply;
  - cap-reached final answer;
  - refusal and `max_tokens` endings;
  - transcript persisted and replayed unchanged (append-only, thinking blocks
    included);
  - compaction blocks persisted and replayed;
  - the prompt prefix is byte-identical across steps and across chats, checked
    on the request the scripted model receives;
  - idempotency, fencing, cancellation and recovery kept.
- `agent-funding.test.ts`: hold before I/O for the new request shape;
  cache-write and thinking settlement.
- `models.test.ts`: `converse` for both providers (streamed tool calls, empty
  content, usage), with the `structured` cases unchanged.
- `agent-cutover.test.ts`: the new SSE events, and a closed stream ends the turn
  as `interrupted`.
- Frontend: `chat-screen.test.tsx` streaming and activity cases;
  `conversation.test.tsx`; the `live-turns` reducer test; `vocabulary.test.ts`.
- Delete, with reasons:
  - `agent-stream.test.ts` (the decoder is gone);
  - the `stepJsonSchema` and `parseStep` cases in `agent-prompt.test.ts`
    (protocol gone);
  - the re-read-hint case in `agent-owner-adapters.test.ts` (hints are replaced
    by replayed transcripts);
  - the repair and `max_protocol_errors` cases.

**Documents**
- [agents.md](../agents.md):
  - rewrite "Context and the bounded loop", "Size budget", "Sources",
    "Terminal turns", "Streaming and the chat" and "Coverage";
  - delete "Model destination admission" and every customer-route and BYOK
    clause.
- [invariants.md](../invariants.md):
  - §13: restate "step, tool-call and size budgets" for the new limits;
  - say that persisted run transcripts are run records, not a knowledge store;
  - §16: drop the Agent BYOK clause.
- [backend-architecture.md](../backend-architecture.md): rewrite the gateway
  paragraph (both adapters, `converse`).
- [decisions.md](../decisions.md): one cross-feature entry, "The Agent uses
  native tool calling" (A1, A2).
- [backlog.md](backlog.md): close "multi-read steps"; leave partial-text resume
  and plan execution.
- `.env.example`: the default-agent comment.
- Public docs site: `apps/docs/src/content/agent.md` (how a turn works,
  parallel reads, thinking summaries); `agent/outputs.md` (streaming text);
  a `changelog.md` entry.

**Commit slices.** Each slice leaves the repository building, with its own
focused tests.
1. **Gateway `converse`.**
   - Anthropic and OpenAI adapters, the result shape and usage (cache writes,
     thinking), and `models.test.ts`.
   - Delete the BYOK `api` option.
   - Nothing calls `converse` yet.
2. **Schema and funding.**
   - Baseline edits: `call_id`, `cache_write_input_tokens`,
     `agent_run_transcripts`; regenerate types.
   - B53 pricing in `ai-pricing.ts` and settlement, plus the new hold-size
     function, with `agent-funding.test.ts`.
   - The owner resets the local DB after this slice.
3. **Tools.**
   - The `load_skill` and `save_document` handlers (validation, outline and
     format rules, staging) and F18.
   - Unit-level owner-adapter tests.
   - The tool-quality pass on MCP descriptions and error text.
4. **Runtime cutover.**
   - The new `turn` loop, parallel tool execution, cache layout, transcript
     persistence, replay and compaction, and the operating-contract rewrite.
   - Rewrite `agent-runtime.test.ts` and `agent-support.ts`.
   - Delete the step protocol, `prompt.ts`, the decoder, re-read hints, repair
     and the old config keys in the same slice, so no dead path survives a
     commit.
5. **Streaming contract and UI.**
   - The event union, route emission, the `live-turns` reducer,
     `conversation.tsx`, the activity line and thinking summary, and
     vocabulary.
   - `agent-cutover.test.ts` and the frontend tests.
6. **Documents.**
   - `agents.md`, invariants, backend architecture, decisions, backlog,
     `.env.example`, and the public docs and changelog.
   - Run `pnpm gate` once.

**Acceptance**
- Focused `pnpm test:api` runs for the files above, and the affected frontend
  tests.
- `pnpm gate` once at the end.
- The [eval](#eval) meets its PR 1 targets against the baseline, with a
  side-by-side answer review.

### PR 2 — Model and reasoning picker, pricing and public copy

**Prerequisite:** O1 is decided (A4); O4 (refusal fallback) is recorded.

**Backend**
- Add the allow-list config and a Sonnet 5.5 price row at the published rates
  in the [provider rate card](../operations/CiteLadder_Launch_Config.md#7-provider-rate-card-internal-cost)
  ($2.00 input, $2.50 cache write, $0.10 cached input, $10.00 output per
  million tokens).
- Schema and contracts:
  - `agent_chats.model` and `reasoning_level`, and
    `agent_runs.reasoning_level` (baseline edit, reset);
  - `agentRequestSchemas` `create` and `message` accept `model` and
    `reasoning_level`;
  - chat summary and detail expose them, and messages expose the model and
    level that produced them.
- Replace the `model_changed` equality checks in `funding.ts`,
  `agent/models.ts` and `model-calls.ts` with allow-list and capability checks
  at admission and dispatch.
- `store.ts`: add model and level to the idempotency fingerprint.
- `converse` takes the model and effort per call. The endpoint and key stay
  per provider.
- `routes/agent.ts`: map an invalid or not-allowed model to a coded 422 or 403.

**Frontend**
- A shared `ModelReasoningPicker`:
  - `Dropdown` with two `DropdownRadioGroup`s, copying the `skill-picker.tsx`
    pattern;
  - a "uses about 20× more credits" hint on Sonnet;
  - a disabled item with a Billing link when the capability is missing.
- A `useAgentModelChoice` hook seeds from the chat's stored choice. It is wired
  into `ReplyComposer`, `NewChat`, `PanelStart`, and `WorkflowStart`/
  `BriefingCard` through `create.start`.
- Defaults live in `lib/config/agent.ts`.
- Update the request types in `lib/api/agent.ts` and `use-chat-turns.ts`.
- Show a model and level chip in the agent bubble header.
- Add error copy in `lib/agent/errors.ts`.
- Tests:
  - the entitlement mocks in `chat-screen`, `new-chat-screen` and
    `agent-panel` tests become key-aware;
  - exact-body assertions include `model` and `reasoning_level`;
  - picker cases cover the default, switching mid-chat, the frozen value on
    retry, and the gated option.

**Documents and copy**
- [billing-entitlements.md](../billing-entitlements.md) AI credits section:
  per-model prices, cache-write and thinking rules.
- [billing-decisions.md](../billing-decisions.md): A4 is B54; record O4 once
  the owner decides it.
- Supersede B12 rather than rewriting it.
- [billing-operator-guide.md](../operations/billing-operator-guide.md): drop
  "one row per model step" wording and the BYOK incident line.
- `agents.md` gains the model choice section, and `docs/design.md` covers the
  picker.
- **Marketing**
  - `lib/marketing-content/platform-pages-improve.ts`:
    - rewrite "Which model does it use?" to say Haiku 5.5 by default, Sonnet
      5.5 available, and Low/Medium/High reasoning;
    - remove "Can I use my own model provider?";
    - fix the "Model providers for the Agent" integration card;
    - refresh "Each step it reads is shown as it works" for parallel reads and
      thinking summaries.
  - Advertise model choice:
    - in the Growth blurb and capability labels in `pricing.ts` (only within
      the coming-soon pricing rules);
    - in `ai-reference.ts`, `llms.ts` and `faq.ts`;
    - in the docs-site `agent.md` (a "Models and reasoning" section).
  - Update the coded product scene `components/marketing/scenes/views-act.tsx`
    with the picker and thinking line.
  - Add a `changelog.md` entry.

**Commit slices**
1. **Allow-list config and Sonnet price row.** Admission and dispatch checks
   replace `model_changed`, with funding tests.
2. **Persistence and contracts.**
   - Schema columns, request and response schemas, the idempotency fingerprint,
     route mapping and `converse` per-call model and effort.
   - Runtime and cutover tests for the frozen choice. The owner resets the
     local DB.
3. **Picker UI.** The component, hook and the four call sites, plus the bubble
   chip and error copy, with frontend tests.
4. **Eval options.** `agent:eval` gains `--model` and `--reasoning` so each
   combination can be measured against the PR 1 run.
5. **Documents, marketing and changelog.** Then run `pnpm gate` once.

**Acceptance**
- Focused tests and `pnpm gate`.
- An eval run on Sonnet 5.5 at Medium and on Haiku 5.5 at Low, recorded in the
  PR.
- An owner check of the copy.

### PR 3 — Further improvements: owner chooses Option A or Option B

The owner wants these:
- web search and fetch;
- actions that run after the user confirms;
- turns that continue on the server after the browser closes;
- scheduled follow-ups (for example, re-measure an Action 28 days after it was
  implemented);
- optional cross-chat memory.

Each one changes an accepted rule, so the owner's choice is recorded before
scoping. Changes needed under either option:
- invariants §10 and §13 (read-only, no autonomous recursion, no unrestricted
  URL access);
- agents.md's browser-only turn rule;
- [mcp.md](../mcp.md) and [decisions.md](../decisions.md) ("the in-app Agent
  stays read-only");
- billing entries for web-search cost and background spend;
- DPA and subprocessor text.

**Option A — Anthropic Managed Agents.** Anthropic runs the loop and the
session. CiteLadder supplies tools via its MCP server (with a per-session member
token in a vault) or via custom tools. Postgres mirrors messages, sources and
outputs for the UI.

| | |
|---|---|
| Gives, built in | Loop, caching, compaction and thinking. Web search and fetch with domain filters. `always_ask` tool confirmations (actions). Sessions that run without a browser, plus webhooks. Scheduled deployments. The Skills API (native skill loading). Memory stores. Hard dollar budgets per session. A Console trace of every session. |
| Costs | Anthropic only (the OpenAI Agent path ends). Model, effort and system prompt are fixed per session, so switching model mid-chat means a new session with replayed history. Beta API, and it needs Managed Agents access. Conversation state lives at Anthropic (DPA update). Billing moves from per-call holds to a session budget plus settlement from reported usage. Running time is $0.08 per session-hour. CI tests replay mocked event streams. Every tool call adds a hop to CiteLadder. |
| Verify first | Whether a session without container tools still provisions a sandbox (startup delay and running-time cost). Event latency against the PR 1 baseline. How per-member MCP tokens are scoped. |
| Size | Replaces most of the PR 1 runtime and funding loop. The PR 1–2 UI, tools, skills, picker and pricing carry over. |

**Option B — extend the native runtime.**

| | |
|---|---|
| Web | Anthropic server tools `web_search`/`web_fetch` (Sonnet and Opus only; not Haiku) or a search provider for OpenAI. Fetched pages are untrusted input; sources gain URLs. |
| Actions | Proposal tools that pause the turn (a `requires_confirmation` state). The confirmed action runs through the existing owner's queue and admission, reusing MCP's `confirm_change` pattern. |
| Background | The browser's `/run` request becomes "attach to the stream". `agent-worker.ts` claims and runs turns from the Postgres queue, and a reconnect replays saved progress. |
| Scheduled | A scheduled run kind on the existing queue, funded and capped like any run. |
| Costs | More code to build and maintain. Keeps OpenAI, per-message model switching, per-call funding, Postgres-owned state and the current test harness. |

## Owner inputs

Record each in the billing decision log before the PR that needs it.

- **O1 (decided, A4,
  [B54](../billing-decisions.md#agent-native-runtime-2026-10-12)).** Sonnet 5.5
  is on Growth and Scale, not on the trial or Starter. It is a current business
  decision, so the gate lives in plan configuration and can change without code.
- **O2–O3 (PR 1): decided as
  [B53](../billing-decisions.md#agent-native-runtime-2026-10-12).** Internal
  cost is calculated at the provider's published rates:
  - cache writes at the published write rate;
  - thinking tokens as output;
  - every call kept below a model's long-context price tier.
  - Customers pay a subscription that includes AI credits. Plan prices and
    credit amounts can change at any time without changing the internal cost
    calculation, which is what informs them per tier.
- **O4 (PR 2).** Refusal fallbacks are deferred. A refused Sonnet turn ends with
  a recovery reply instead of silently re-running on another model.
- **O5 (done).** The live eval is built and the baseline is recorded; see
  [Eval](#eval).
- **O6 (PR 3).** Choose Option A or Option B, and approve the invariant changes
  it needs.
- **O7 (done).** The legal pages name Anthropic and OpenAI as the Agent's
  providers and describe stored Agent conversations; see R12 and R15 in
  [legal decisions](../operations/legal-decisions.md).
- **O8 (decided).** Thinking blocks may be stored for replay. They are kept only
  in `agent_run_transcripts`, never returned by a read, and deleted with the
  chat. Customers are not shown everything the model thought (A7).

## Eval

`pnpm --filter @citeladder/api agent:eval --live --label <name>` (from
`frontend/`) drives the chats in
[`eval-cases.json`](../../frontend/services/api/test/fixtures/agent/eval-cases.json)
through the local Agent API, as described in
[Agent coverage](../agents.md#coverage).

- **The cases.** 16 chats and 20 turns:
  - plain questions;
  - skill work;
  - outline-first and short deliverables;
  - Action-attached chats;
  - a missing-evidence case;
  - four follow-ups that need the first turn's reads.
- **Portable placeholders.** `{{brand}}`, `{{top_prompt}}`, `{{competitor}}`
  and the Action selectors resolve from the chosen project, so the cases run on
  any local data.
- **Each case has a `review` line**: what a correct answer must do, for the
  side-by-side review.
- **Measures:** time to first visible text, total time, model and tool calls,
  and tokens with the cached share. The time to first text is detected from
  either event shape, so the same script measures the old and new runtimes.
- **Compare:** `--report baseline-main,<label>` prints the table below and
  writes the reply review.
- **After PR 1 slice 2**, extend the eval to report cache writes from the new
  column.

### Baseline (`main` at 4d9df29, Haiku 5.5, 2026-10-12)

| Metric | baseline-main |
|---|---|
| Turns succeeded | 20 of 20 |
| First text, median / p90 | 18.0 s / 35.8 s |
| Total, median / p90 | 21.1 s / 42.4 s |
| Model calls per turn | 3.4 |
| Tool calls per turn | 2.3 |
| Input tokens per turn | 103,185 |
| Cached share of input | 0% |
| Output tokens per turn | 3,925 |

**What the baseline replies show.** Every turn "succeeded", but most answers
are partial because of the loop itself.
- **The read budget ends the work.**
  - s09 (the diagnosis of the top prompt) spent all 6 reads without reaching
    that prompt. It answered "I can't diagnose this prompt yet … I can't read
    them again in this turn".
  - s15 (internal links) used 6 reads and "cannot yet name safe placements".
  - q02 "could only read 2 of the 10 prompt answers in full" (F7–F8).
- **Follow-ups start over.** q01 turn 2 re-read visibility results five times,
  repeating turn 1's reads, and still "not checked the other prompts" (F6).
- **The model cannot see its own calls.**
  - q08 called `read_performance` four times in a row with the same
    `unavailable` result before checking integration status (F5).
  - q01, q02 and s09 each lost a read to a refused `read_visibility_results`
    call (bad arguments, F7).
- **Deliverables skip evidence.**
  - The comparison outline (s16) and both Action content turns (s13) made no
    reads.
  - The growth plan (s11) read only the business context, said "Actions were
    not read", and saved no document.
- **No turn used the cache** (F1). Every call re-sends about 28–36K tokens of
  largely identical prompt, so a 7-call turn sends up to 246K input tokens at
  full price.

### PR 1 targets

Measured on the same project with the same cases:
- median time to first text under 5 s;
- cached share of input above 60%;
- input tokens per turn at most half the baseline;
- no turn failing where the baseline succeeded;
- the q01 and q03 follow-ups answer from the first turn's reads;
- the review lines hold at least as often as the baseline.

## Done when

- **PR 1:**
  - Agent turns stream from the first token, read in parallel, recover from
    their own mistakes and remember earlier reads.
  - Prompt caching shows non-zero cache reads after the first call of a turn.
  - The step protocol, the partial-JSON decoder, re-read hints and BYOK
    leftovers are gone (checked against the deletion lists above).
- **PR 2:** users choose Haiku 5.5 or Sonnet 5.5 at Low, Medium or High per
  chat, every run records and charges its own model, and public copy matches.
- **PR 3:** the owner has chosen an option, and it is scoped as its own plan.
