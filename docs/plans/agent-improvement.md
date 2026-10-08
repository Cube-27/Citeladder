# Agent chats, workflows and deliverables improvement plan

Feature 5 of the [feature review tracker](feature-review-tracker.md); this is its
audit-derived plan. **Status: implementing (2026-10-08).** Shipped behaviour is owned by
the [Agent](../agents.md), not by this plan. Constraints:
[invariants](../invariants.md) 10-13 (explicit decisions, inspectable context,
no fabricated facts, bounded orchestration), commit-before-network-I/O and
persisted-projection reads. File references are to `frontend/services/api/src/`
or `frontend/` as noted.

## Why

The Agent is CiteLadder's only content-generation surface, and MCP customers
run the same methodologies over the same read tools. The owner wants it to work
like a normal chatbot (Notion AI, Peec, ChatGPT): the answer appears as it is
written, the user picks a defined workflow instead of guessing a prompt, and
failures say what happened and what to do. New deliverable types (social,
video, websites) should then need a workflow and a skill, not code across the
stack.

A read-only audit of the runtime, routes, skills, MCP binding, UI and tests
(2026-10-08) found the gap is structural as well as visual:

- **Nothing streams.** Each step is one non-streamed JSON completion; the reply
  and a document of up to 100k characters are generated inside JSON fields and
  appear all at once after a 2 s whole-chat poll.
- **Auto-routed deliverables are generated twice.** A step that selects a skill
  and returns output has its output discarded and regenerated
  (`agent/runtime.ts:228-236`), up to 16k output tokens each.
- **Truncation is invisible.** `finish_reason` is stored but never read; a cut-off
  JSON body gets a "no Markdown fences" repair hint, is regenerated at full cost,
  and the second protocol error fails the turn.
- **Limits contradict each other.** A 100k-character body cannot be produced in
  16 384 output tokens or re-read inside a 90k-character transcript with a
  30-45k system prompt, so a large saved (or user-pasted) body makes every later
  turn fail with `output_context_size_limit`.
- **Revising damages provenance.** References already in the current revision are
  not citation grants, so a revision turns them into `[unverified reference]`
  and the new revision's `source_refs` shrink to this turn's reads.
- **Failures go silent or vague.** Exhausted retries, lease-recovery exhaustion
  and cancellations end without a reply (`agent/queue.ts:150-216`,
  `agent/store.ts:397-426`); every non-Agent error becomes `provider_error`;
  402 means credits even when the model route changed; size limits say "try
  again" though retrying cannot help.
- **Workflows are prose.** Four hard-coded starter strings, a per-kind table of
  refinements and next steps in the browser (`lib/agent/next-steps.ts`),
  kind-specific branches in the output pane, and `format_kinds` config that the
  runtime ignores in favour of a literal `'content'`.

## Owner decisions (2026-10-08)

1. **Streaming transport: SSE, ephemeral.** The interactive `POST …/run` answers
   `text/event-stream` with progress and text deltas. Partial text is never
   persisted; a dropped stream falls back to the persisted poll and the final
   message. No schema change.
2. **MCP skill parity: maintained.** Skills may be improved, but the public
   plugin pack and the in-app skills keep their current relationship: where a
   plugin skill mirrors an in-app methodology (`ai-visibility-review` ↔
   `ai_visibility`, `ai-search-change-review` ↔ `measure`,
   `technical-seo-triage` ↔ `technical_health`), a methodology change lands in
   both, adapted to the tools each surface has.
3. **Outline-first: long-form only,** declared per content format. Short social
   formats draft directly.
4. **Carried-over references stay valid.** Superseded by decision 5: a
   revision's sources are its predecessor's plus what this turn read.
5. **Sources are server-derived; the model handles no record IDs in user text.**
   "Evidence" today is a list of database-row pointers (`citeladder://audit/<uuid>`)
   that tools return, which the model must repeat in an `evidence` field and
   which the runtime filters, replacing stray ones in the text with
   "[unverified reference]". The UI then prints raw IDs, budgets and omission
   codes. Instead: the model's `evidence` field is removed; a reply's sources
   are the records its reads returned (plus the attached or mentioned Actions'
   findings), grouped in plain words with links to their screens; record
   references and UUIDs are removed from replies and documents outside a
   machine-readable fenced block a skill requires; the "Source identities",
   budget and omission-code displays go. Grounding still means every figure
   comes from a read of the customer's data, which the contract states as a
   hard rule.
6. **Lean skills.** The operating contract and each skill describe the
   deliverable's shape, the data to read and a few hard rules (no invented
   facts, real dates and units, unavailable is not zero), and drop process
   ceremony (evidence manifests, mandatory claim labels) that small models find
   confusing and frontier models do not need. Mirrored plugin skills get the
   same changes (decision 2).

## Phase 1: runtime correctness, context and cost

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | Deliverables generated twice when the skill is chosen on the respond step. | Without a selected skill, the response schema forbids `output`; the model selects a methodology with a small `use_skill` step (one short call instead of a second full generation). | `agent/contracts.ts`, `agent/runtime.ts`, operating contract |
| 1.2 | Truncated responses read as protocol errors and are regenerated. | Read `finish_status`; `length` ends the turn as `output_too_long` with guidance (narrow to a section, shorter format), no repair call. | `agent/runtime.ts`, `agent/model-calls.ts` |
| 1.3 | Contradictory size limits strand chats. | One coherent budget: the body bound fits the output-token cap and the transcript fits the system prompt plus the bound body; user edits share the bound. | `config/agent-runtime.json`, `config/model-gateway.json`, `agent/outputs.ts` |
| 1.4 | Revision references stripped; the model must repeat record IDs. | Decision 5: server-derived sources, ID scrubbing, no `evidence` field. | `agent/runtime.ts`, `agent/contracts.ts`, `agent/outputs.ts` |
| 1.5 | Silent terminal states. | Every terminal failure, exhaustion and cancellation appends one recovery reply with a code-specific message; history marks the turn as unanswered. | `agent/queue.ts`, `agent/store.ts`, `agent/runtime.ts` |
| 1.6 | Lossy failure codes. | Validation and trial/plan refusals keep their own codes; 402 is split into credits vs model route; the run view says whether a retry is pending or would not help. | `agent/runtime.ts`, `routes/agent.ts`, contracts |
| 1.7 | MCP display tools offered to the model. | Exclude `render_*` and `open_analytics` from the Agent registry. | `agent/tool-adapters.ts` |
| 1.8 | Per-step cost: manifest JSONB rewritten every step, duplicate lock-only transactions, "steps remaining" inside the system prompt breaking prefix caching, unbounded prior-tool scan. | Write the prompt summary once at settlement, fold the lock checks, move the per-step budget line to the end of the request, bound the scan. | `agent/runtime.ts`, `agent/model-calls.ts` |
| 1.9 | History sliced mid-message. | Cut at a character boundary with a disclosed marker. | `agent/prompt.ts` |
| 1.10 | Dead config: `format_kinds` (runtime hard-codes `'content'`), `context_limit`, `reconcile_poll_seconds`, `worker_poll_seconds`; `renderManifest` test-only. | Use `format_kinds`; remove the rest. | config, `agent/context.ts` |
| 1.11 | Skills name things that do not exist ("native content catalog", a per-prompt `list_content_differentiation` filter), loop on truncation (`topics_truncated`), and carry process ceremony. | Decision 6: lean rewrite of the contract and skills, with the audit's corrections; mirrored plugin skills updated. | `assets/agent-skills`, `plugins/citeladder/skills` |
| 1.12 | Decision 3. | Formats declare `long_form`; only long-form outputs are outline-first. | `content_formats.md`, `config/skill-inputs.ts`, `agent/runtime.ts` |

## Phase 2: workflows as the extension seam

A **workflow** is a defined entry point: label, description, the skill it runs,
an optional pinned format, a starter message with named inputs, the refinements
offered after a deliverable, and the workflows that take the work forward. It is
packaged beside the skills (`assets/agent-skills/workflows.json`), validated by
the skill loader, fingerprinted into the catalog version, and served by the
existing catalog endpoint. Methodology stays in `SKILL.md`; presentation and
routing live in the workflow. Adding a deliverable type becomes: a format
section and/or a `SKILL.md`, plus workflow entries.

| # | Change | Where |
|---|---|---|
| 2.1 | Workflow catalog: schema, loader validation (skill exists, format exists and belongs to a format kind, next-step ids resolve), catalog endpoint projection. | `agent/skills.ts`, `config/agent-skills.ts`, `routes/agent.ts`, contracts |
| 2.2 | Admission accepts `workflow_id`: pins its skill and format on the run (frozen in the manifest), so the methodology is present from the first step. | `agent/store.ts`, `agent/context.ts`, `agent/runtime.ts` |
| 2.3 | New chat becomes a workflow gallery grouped by job (Create content, Social and video, Improve a page, Diagnose visibility, Plan); picking one fills a guided composer. The panel offers the workflows relevant to its screen. | `components/agent/new-chat-screen.tsx`, `agent-panel.tsx` |
| 2.4 | Refinements and next steps come from the catalog; `next-steps.ts`, the starter constants and the per-kind label map are removed. A small output-kind registry owns the only kind-specific UI (prompt portfolio renderer and Review in Prompts). | `lib/agent`, `components/agent/output-pane.tsx` |

## Phase 3: chatbot experience

| # | Change | Where |
|---|---|---|
| 3.1 | Gateway streaming: `stream: true` with usage on the final chunk for the platform transport; a buffered fallback for transports or providers that cannot stream, with identical settlement. | `models/gateway.ts`, `models/http.ts`, `providers/app-models.ts` |
| 3.2 | Runtime event sink: committed step progress, and reply/body text decoded incrementally from the streamed step (`reply` first, then `output.body`). Text is display-only until the settlement transaction saves the message and revision. | `agent/runtime.ts`, new `agent/stream.ts` |
| 3.3 | Decision 1: SSE on `POST …/run` with heartbeats under the Cloudflare idle limit; reconnecting never re-executes. | `routes/agent.ts`, `lib/api/agent.ts` |
| 3.4 | The conversation shows the user's message immediately, then the streaming reply and the document filling in, with plain-language activity ("Reading Search Console queries") and elapsed time. | `components/agent/conversation.tsx`, `use-chat-turns.ts` |
| 3.5 | Stop in the composer (and Esc), Regenerate on the last reply, Edit and resend the last message, Retry on a failed first send. | `components/agent` |
| 3.6 | One error presenter: each run code and API error maps to a sentence and an action (retry, Billing, Providers, new chat, shorten); no raw enums, IDs or budget numbers. | `lib/agent/errors.ts`, `vocabulary.ts`, `conversation.tsx` |
| 3.7 | One chat surface with a `full` and `panel` variant replaces the duplicated panel conversation and start views. | `components/agent/chat-screen.tsx`, `agent-panel.tsx` |

## Tests and documents

- Add: no output without a selected skill (no double generation); `length`
  finish ends as `output_too_long` without a repair call; carried-over revision
  references survive; every terminal path appends one reply; display tools are
  not in the Agent registry; workflow loader rejects unknown skill/format/next
  step; workflow admission pins skill and format; stream decoding of partial
  JSON strings (escapes, surrogate pairs, chunk splits); a streamed turn saves
  exactly what a buffered turn saves; the SSE route emits progress, deltas and
  one terminal event and never re-executes; regenerate and edit-resend send a
  new turn; error presenter actions per code.
- Remove, with reasons: copy and constant-restating assertions found by the
  audit (`lib/agent/vocabulary.test.ts`, `test/agent-skills.test.ts:62-69`,
  chat-screen step-label and next-step-constant tests, duplicate
  unverified-reference assertions), and tests of retired `next-steps.ts`.
- Rewrite [Agent](../agents.md) from the shipped behaviour; update
  [invariants](../invariants.md) 13 if the protocol change needs it,
  and the public Agent docs pages.

## Deferred

Multi-channel repurposing in one chat (one output carries one format), durable
partial-text resume (unless decision 1 chooses it), per-project skill
enablement, memory promotion and plan execution stay in the
[backlog](backlog.md) deferred proposals.
