# Agent chat UX

Owner-approved on 13 November 2026, after a review of the Best&Less production chats from 10 to 13 November
and an HTML mockup. Owner words: implement B (Action links), C (confirm card), D (paste as attachment) and
the sidebar subtitle; a Claude-like composer; fix the text jumping on every tool call; make tool calls human
readable or hide them ("model call 1, reading or saved document doesn't make any sense"); fix repeated tool
errors and repeated actions; adopt the [AI Elements](https://ui.shadcn.com/docs/ai-elements) patterns; then a
final review and simplification pass over the whole Agent feature.

Not in scope: credits top-up (later), edit/copy/export (already shipped), provider errors of 10 November
(a missing API key, already fixed), the rest of mockup A (context card, titles from the subject).

## Shared rules

- AI Elements are a pattern source, not a dependency. Port the structure and behaviour of the named component
  into `frontend/components/ui/` as an organism built on the existing primitives (`button`, `disclosure`,
  `chip-input`, `citation`, `chat-dock`, `dialog`) and tokens. No shadcn CLI, no `components.json`, no `ai`
  package. Atoms own geometry; feature folders do not set geometry ([docs/design.md](../design.md),
  `pnpm check:policy`).
- Users never see tool names, record IDs, UUIDs, `citeladder://` refs or budget numbers.
- Layout must not shift while a turn streams or when a control is clicked.

## PR 1 — Tool reliability (back end)

Production evidence (agent_tool_attempts, 1–13 November): `fetch` refused for `citeladder://prompt/<id>`;
`read_visibility_results` refused three times with an all-zero `audit_id` in "Work on <prompt>" chats; a turn
showing "Saved the document" twice.

- Save once per turn: `saved` in `builtin-tools.ts` is per response (`runtime.ts` `runTools`). Track staged
  documents per turn; refuse a second whole `save_document` of a document staged this turn ("use
  edit_document") and a new save whose title matches a staged document. Tool result: "Document N saved
  ('<title>'). Reply now." Operating contract: save once, then reply.
- One operating-contract line on what the Agent can read: own pages via `read_page_text`, pages AI answers
  cite via `read_source_url`, other pages only through web search results; `fetch` takes only a
  `citeladder://` id a read returned. The `NOT_A_RECORD` refusal says the same. Either allow the prompt record
  kind in `fetch` if a reader exists, or make the refusal name the right read.
- `read_visibility_results`: `audit_id` optional, defaulting to the latest completed visibility run (shared
  MCP owner; keep the MCP plugin consistent).
- Agent tool descriptions must not name MCP-only tools (`update_action_status`, `prepare_declare_implemented`,
  `generate_prompts`, `render_*`); neutralise them in the Agent adapter (`tool-adapters.ts`) or the shared
  description.
- `runSummary` must not count refused reads as data reads.
- Commit this plan as `docs/plans/agent-chat-ux.md` with an Active entry in `docs/plans/ACTIVE.md`.

## PR 2 — Readable activity (AI Elements: Chain of Thought, Tool)

- Contract (`packages/contracts/src/agent.ts` step schema): a discriminated union on `kind`. `tool` steps gain
  an optional `target` (≤200 chars); `document` steps gain `action: created|replaced|edited`, `number`,
  `title`. The live `tool` event carries `target` too.
- API: take the first allowlisted free-text argument (`url`, `query`, `domain`, `entity`, `folder`), never
  `id`, UUID-typed fields or enums; scrub with `scrubRecordRefs`; truncate. Built-ins record action, number,
  title. Enum filters (Action status) map through existing label maps on the client.
- One function `activityRows(steps)` in `frontend/lib/agent/vocabulary.ts` feeds both live and saved views.
  Summary line grouped by verb ("Read Actions and visibility · searched CiteLadder · saved Document 1 ›");
  rows are verb + noun + muted detail ("Searched CiteLadder  school uniform", "Read page  …/returns",
  "Searched the web  …", "Edited Document 1"). No "Model call N" rows; refused rows hidden; failed shown as
  "Couldn't read …"; no disclosure when nothing is visible. Thinking stays (Reasoning pattern).
- Trim internal IDs and version strings from the run progress payload sent to the browser if no longer read.
- Rewrite the activity description in `docs/agents.md`.

## PR 3 — Stable live turn (AI Elements: Conversation, Shimmer)

Root causes (all in `live-activity.tsx`, `live-turns.ts`, `use-chat-turns.ts`, `use-follow-latest.ts`):
the "Current reads" list mounts and unmounts under the reply each step; the status line rewrites and wraps;
"View activity" appears mid-turn from a stale `run.progress`; reply and thinking text reset on each model call;
the pending user bubble blinks before the refetch; `useDeferredValue` can show live and saved reply together.

- One fixed-height `nowrap truncate` status line (Shimmer) at the top of the live turn, `tabular-nums`, present
  from start to finish; parallel reads fold into it and into the PR 2 activity rows built from live events.
  Nothing below the streaming text changes height.
- Keep each model call's reply text as segments instead of replacing it.
- Keep the pending bubble until the persisted message arrives.
- Replace "Jump to latest" with a round down-arrow `IconButton` (accessible name stays "Jump to latest")
  centred above the composer (Conversation scroll button).

## PR 4 — Composer (AI Elements: PromptInput, attachments)

- Single-row textarea that grows upward to `AGENT_COMPOSER_MAX_ROWS` (frontend config) then scrolls inside;
  sits lower; skill picker and icon Send/Stop on a slim row beneath (accessible names "Send"/"Stop" kept);
  shorter placeholders. Every host shares it: chat screen, panel start and chat, new-chat screen, page
  workspace. Cap the `/` and `@` suggestion list height.
- A paste longer than a client threshold becomes a removable, viewable "Pasted text" chip. Stored as
  `attachments: [{kind: 'pasted_text', text}]` on the request and message contracts, a forward migration
  adding `agent_messages.attachments jsonb not null default '[]'`, count/size limits in
  `services/api/src/config/agent-runtime.json` exposed through the catalog `limits`. The model receives each
  paste as its own text block labelled as pasted data, not instructions. Resend, recover/edit and idempotency
  carry attachments. Decide whether UUIDs in pastes count as written by the person (`sources.ts` `writtenIds`).

## PR 5 — Actions everywhere (mockup B)

- `listActions` and its route gain `q` (contains on `target_label`) and an "any status" filter; the @ picker
  queries the server by typed text across all statuses and shows a status pill; `read_actions` gets the same
  `query` and any-status option, and its description states its default.
- A pasted same-origin `/agent/actions/<uuid>` URL becomes a mention chip at paste/send time (shared composer
  hook; resolve with the Actions API and check the project); the URL is removed from the text.
- Action names in replies become chips with a status pill: attached and mentioned Actions add their own
  `citeladder://action/<id>` to the turn's sources; `readChat` projects `{id, target_label, effective_status}`
  for referenced Actions in one workspace-scoped query; the renderer upgrades exact label matches. The
  contract tells the model to name an Action by its exact label. Update `docs/agents.md` and
  `docs/invariants.md` wording on sources from attached/mentioned Actions.

## PR 6 — Confirm card (mockup C; AI Elements: Confirmation)

- Built-in `propose_declaration` (Action, optional output revision, go-live day, deployment reference),
  accepted only when the turn read, attached or mentioned that Action and it is declarable; staged like
  suggestions and persisted on the reply (forward migration adding `agent_messages.proposals jsonb`).
- The card reuses `MarkImplementedButton` and the existing declaration API with prefilled values; the user
  confirms in the dialog. After declaring, the card shows the persisted declared state.
- One sentence in `docs/agents.md`: the Agent may propose a declaration; only the person's click declares.
  No invariant change (the Agent still has no write tool).

## PR 7 — Sidebar subtitle and no-credits line

- Each chat row shows a subtitle: origin + last-activity date ("Site Health · 12 Nov"). Origin is derived
  server-side in `listChats` `summary()` from `context_refs` with precedence Site Health → Page →
  Recommendation → Demand → Keyword research → Prompts → Action (`action_id`) → Chat; labels map on the
  client reusing `contextChips` wording. Restore a meta slot on `SidebarRecordRow` (removed in #827; the
  owner asked for it again on 13 November).
- The no-credits reply adds: "To get more, email contact@citeladder.com." with a mailto link.

## PR 8 — System review and simplification

One cross-PR reviewer over the whole Agent feature (front end, API runtime, contracts, docs): seams between
PRs 1–7, dead paths (old `RunActivity`, unused progress fields, the replaced Jump button), duplicate helpers,
stale docs, tests coupled to implementation. One PR of fixes.
