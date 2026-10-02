# Agent capabilities

## Status and scope

Revised on 30 September 2026 at the owner's request. The clarified objective
is **a ChatGPT/Claude-like conversation inside CiteLadder, guided by defined
skills and workflows**. The current document UI is satisfactory. Improve the
experience of talking to the Agent without adding a more complicated workspace.

Slices A–C were assigned for implementation on 30 September 2026 through the
owner's implement-plan request. They now have scripted conversation coverage,
conditional artifact instructions and shared chat interaction refinements;
CI/merge and deployment acceptance are tracked separately. Foundations and MVP
items 1–4 are present in this checkout: local history records the MVP in
`6a490d78` (#203) and evidence/handoff fixes in `f7c369fc` (#206). This replaces
the earlier branch-only status; it does not establish deployment or fresh
runtime validation. Items 5–7 and the expanded item 8 corpus remain deferred;
the scope and order below supersede their original estimates and priority.

Owner: [Agent](../agents.md). Follow [Design](../design.md), the
[frontend architecture](../frontend-architecture.md) and
[invariants 10–13](../invariants.md#10-automation-stays-bounded).

**No pending TypeScript migration blocks conversation UI refinement.** The
frontend and shared contracts are already TypeScript. The Agent API and worker
remain Python. Small operating-contract/prompting improvements can accompany
the UI with focused coverage; substantial runtime, persistence and streaming
work should follow the Agent's TypeScript cutover.

## Product outcome

A user can ask a plain-language question, discuss the answer, correct an
assumption, request work, and refine the result in one natural conversation.
Skills supply the method behind that interaction. The user should not have to
learn the skill catalog or choose a mode before talking.

The normal path is:

**Ask → use relevant context → answer or clarify → produce requested work →
refine → offer a useful next step.**

The existing chat, document, sources, history and Action handoffs remain the
product structure. Keep one chat with at most one deliverable kind. Ordinary
questions and discussion do not require a deliverable or a new chat.

Notion is a limited interaction reference: its Agent uses the current page or
selected content as context and supports focused edits. That supports clearer
context and follow-ups here, not a new page hierarchy or editor. See
[Notion's Agent documentation](https://www.notion.com/help/notion-agent).
The owner's clarified chat-first objective takes precedence.

Out of scope: document layout redesign, block editing, new panels/navigation,
a workflow builder, multiple autonomous agents, a separate memory store,
uploads, new read tools, web research, scheduled runs and external mutations.

## What is already implemented

Retain these features rather than rebuilding them:

| Original item | Implemented baseline |
|---|---|
| 0. Foundations | Frozen skill-catalog fingerprint and time budget, bounded skill loader, shared vocabulary, tool contract coverage, explicit refusal reasons and committed run progress |
| 1. Chat polish | Evidence chips, copy reply, deliverable refinements, next-skill handoffs and starters that select a skill |
| 2. Document canvas | Section edits as new user revisions, Agent revision requests, bounded comparison/history and the dedicated prompt-portfolio view |
| 3. Composer | `/skill`, up to five typed Action mentions, server authorization and frozen Action diagnoses |
| 4. Briefing | Explicit Brief me starts a growth-plan chat with the top open Actions; no background or scheduled briefing |

The [Agent owner](../agents.md) carries the detailed shipped contracts.
Section edits preserve other sections; an **Agent** section-revision request
still returns a complete document and does not deterministically lock other
sections. Compare remains important.

## Where refinement is needed

These code-grounded observations describe the baseline before slices A–C and
their implemented refinements, not claims from a live UX test.

| Current owner | Observation | Planned refinement |
|---|---|---|
| [Operating contract](../../backend/app/core/config/agent_skills/operating_contract.md), [historical prompting](https://github.com/Cube-27/Citeladder/blob/57c7309b8c159e03bc6f41084c36eeb3be096c08/backend/app/domain/agent/prompting.py) | The protocol permits a reply with no output, but the contract repeatedly asks for a deliverable; an outline-required skill adds an unconditional outline instruction | Make questions, clarifications and deliverable requests explicit conversational cases; outline approval remains mandatory when creating long-form work |
| [Skill picker](../../frontend/components/agent/skill-picker.tsx), [historical admission](https://github.com/Cube-27/Citeladder/blob/57c7309b8c159e03bc6f41084c36eeb3be096c08/backend/app/domain/agent/service.py) | The picker can say Automatic while admission inherits a pinned, Action or output skill; omitting a skill does not necessarily clear the pin | Show the effective selection honestly; preserve compatible skills and do not imply a fresh router decision on every turn |
| [Conversation](../../frontend/components/agent/conversation.tsx), [next steps](../../frontend/lib/agent/next-steps.ts) | Suggestions follow output kind, and a completed output keeps them visible even after later discussion | Keep suggestions optional, relevant and quiet; suppress repetitive suggestions after ordinary replies where the current DTO supports that decision |
| [Chat screen](../../frontend/components/agent/chat-screen.tsx) | New messages, run-status changes and revisions trigger end scrolling | Follow the latest conversation only when the user is already at its end; preserve position while reading older replies or the document |
| [Turn hooks](../../frontend/components/agent/use-chat-turns.ts), [run display](../../frontend/components/agent/conversation.tsx) | Polling exposes committed work, Stop and errors | Improve acknowledgement, activity hierarchy, draft preservation and recovery without inventing streamed text or hidden reasoning |

## Conversation behavior contract

These are behaviors of the existing respond/tool/skill loop, not new public
modes, agents or a separate intent-classification service.

| User intent | Expected response | Saved output |
|---|---|---|
| “Why are we missing from AI answers?” | Read relevant persisted evidence, answer directly, cite it and explain consequential limitations | None unless the user asks for a report |
| “What do you mean by that?” | Explain the previous answer using available context; avoid restarting discovery | Unchanged |
| “Actually, focus on enterprise buyers.” | Apply the correction within this chat; distinguish a task preference from a reviewed company fact | Change only if revising requested work |
| “Write a page for this topic.” | Use the appropriate skill and request only missing information that materially changes the work | Outline first where required; draft only after explicit outline approval |
| “Shorten the introduction.” | Use the current revision, make the requested change and give a brief explanation | One new complete revision; compare remains available |
| “What should we do next?” | Suggest a justified next action using existing deterministic ranking and evidence | No automatic execution or new document |
| Request needing unavailable data | Give the useful supported answer and name the missing source plus the owning CiteLadder screen | Never substitute invented facts or observed zero |

Implementation rules:

- Answer first. Use the length and structure the question needs; short follow-ups
  should not repeat a full diagnosis, the skill checklist or the document.
- Ask one concise grouped clarification only when the answer materially changes
  the task. Reuse reviewed context and available conversation; do not restart
  onboarding. For a non-blocking preference, state a reasonable assumption and
  proceed within scope.
- A clarification is a normal persisted reply with no output. The user's answer
  is the next ordinary turn; no new interview state machine is needed.
- Align the shared operating contract, applicable skill instructions and runtime
  prompt so a selected content skill can still answer a question. Preserve
  deterministic outline enforcement at output admission.
- Earlier chat text is bounded working context, not unlimited memory. Do not
  promise recall of truncated history or treat a generated statement as
  reviewed brand truth. If material context is unavailable, say so.
- Do not call tools merely to appear busy. Use supplied context where sufficient;
  read persisted evidence when the answer needs it. Do not add a router model,
  reflection call or factual-claim validation layer.
- Distinguish answering from creating/revising an artifact. A question about a
  saved draft must not silently create a new revision.

## Chat UI refinement

Preserve the current centred conversation, pinned composer and document UI,
using the existing visual tokens and shared primitives.

1. **Easy entry.** Put plain-language input first. Keep outcome-based starters,
   the current skill picker and `/` shortcuts as optional assistance. Actions
   and Brief me remain available without dominating the conversation.
2. **Honest skill selection.** Show the selected/effective workflow as a quiet
   label. Existing output-kind restrictions still apply. If clearing a pinned
   skill requires a server contract change, scope that separately; do not ship
   a button whose “Automatic” label promises behavior admission does not provide.
3. **Clear context.** Keep attached Actions, mentions and evidence handoffs as
   removable typed chips before sending. Distinguish selected context from the
   exact context actually used. Do not label the chat's `context` DTO as a full
   frozen run manifest.
4. **Responsive conversation.** Acknowledge sending immediately; indicate queued
   versus working states with a short factual activity label. Keep detailed
   committed steps in an expandable disclosure and Stop easy to reach. No fake
   typing animation, percentages, elapsed-time promises or reasoning transcript.
5. **Respect reading and drafting.** Show a jump-to-latest affordance when the
   user scrolls up. New polling results and revisions must not steal focus or
   reading position. Preserve unsent text after recoverable errors.
6. **Useful follow-ups.** Prefer a small set of applicable suggestions over a
   repeated menu. Ordinary freeform replies always remain available. A
   suggestion can prefill the composer for review; it should be clear when an
   explicit action starts a funded turn or opens another chat.
7. **Simple recovery.** Separate a failed send from a failed accepted run. Retry
   an uncertain network submission with the same idempotency key. An explicit
   new attempt after a terminal run receives a new key and normal admission.
   Keep the previous saved output when a turn fails, is cancelled or hits a limit.

Use the same interaction rules in the existing Dashboard Agent panel and full
chat. Open in Agent continues the same chat and output. No additional panel or
parallel conversation implementation is introduced.

At narrow widths the current single-column structure remains. Verify keyboard
submission, multiline input, IME composition, `/` and `@` menu precedence,
visible focus, accessible Stop/retry controls and restrained live announcements.
Keep drafts scoped to the active chat/project in memory; no private-content
browser storage. Preserve authorized reading when funding is unavailable, and
remove inaccessible content on membership loss or project changes.

## Skills and workflows: the smallest useful structure

Keep the existing packaged skill catalog as the single methodology owner.
No new workflow engine or graph is required.

- **User intent:** freeform request, starter, explicit skill or Action handoff.
- **Skill selection:** existing precedence (explicit choice, Action/chat context,
  otherwise runtime selection), subject to the chat's output-kind contract.
- **Method:** bounded evidence gathering and reasoning inside that skill.
- **Reply:** answer, clarification or summary, with a deliverable only when needed.
- **Continuation:** ordinary follow-up, existing outline approval, or an explicit
  next-skill handoff.

A skill's internal method should make its entry conditions, needed evidence,
clarification boundary, output expectations and sensible follow-up clear.
Do this in the existing loader/contract and skill bodies, not a second registry.
Public metadata continues to expose labels, descriptions and output kinds,
never private methodology.

Use current workflows as the first acceptance paths:

| Workflow | Conversational path |
|---|---|
| Diagnose | Ask about a gap → evidence-backed explanation → discuss evidence → optionally request a diagnosis document |
| Create content | Request content → clarify material gaps → outline → explicit approval → draft → freeform refinements |
| Improve an Action | Work on this → explain recommendation → produce the compatible deliverable → user review |
| Brief and prioritize | Explicit Brief me → explain ranked Actions → user chooses where to work |
| Move to another deliverable | Explain the next step → user opens the existing new-chat handoff with Action/title context |

Changing output kind still needs a new chat. Explain that boundary at the
handoff instead of making the user discover it through a failed send. Do not
silently copy generated prose as evidence. Questions about the current work
stay in the current chat.

## TypeScript migration: what must happen first?

The [migration sequence](citeladder-typescript-migration.md#6-pr-sequence)
records PRs 1–11 implemented and PRs 12–20 pending. Its opening status line
lags its PR 11 section. Deployment and the required one-week cutover soaks
remain pending from PR 3 onward; implementation is not release acceptance.

Current code confirms the relevant boundary:
[the route manifest](../../frontend/packages/contracts/src/route-ownership.ts)
assigns `agent` to Python; the UI/contracts are TS; the
[TS model gateway](../../frontend/services/api/src/models/gateway.ts) exists,
but Agent funding, customer routes and execution still use Python owners.

| Planned work | Must finish migration first? |
|---|---|
| Composer, scrolling, progress disclosure, suggestion presentation and recovery | No; use current contracts |
| Conversation instructions and narrow prompting corrections | No; change the existing owner, test it, then carry it into PR 19 |
| Offline Agent behavior coverage | No; establish it before model-input changes |
| New runtime services, durable plan state, source-aware memory promotion or project skill policy | Yes: land the PR 19 Agent owner first |
| SSE progress / provider reply streaming | After PR 19 baseline, in separate slices |
| PR 20 policy transfer and remaining bridge cleanup | Not a prerequisite for this chat refinement |

**Recommended sequence:** refine chat now, continue the approved migration order,
then add runtime enhancements in TypeScript only when they solve a demonstrated
remaining problem. Do not make the user wait for the entire migration to receive
a better conversation experience.

[PR 19](citeladder-typescript-migration.md#pr-19-agent-runtime) depends on more
than the already-implemented PR 11 transport:

- PR 15 moves the shared MCP readers/catalog.
- PR 16 moves billing and the funded entitlement ledger.
- PR 17 moves customer provider routes and credential handling.
- The earlier project/access/integration owners and PR 18 evidence owners help
  retire remaining Python readers and bridges. Follow the approved sequence;
  this is not a claim that every preceding PR directly blocks a UI change.

Moving PR 19 earlier would need a separate caller/writer/lock inventory and
reviewed migration resequencing. This plan does not introduce cross-stack
services or dual Agent writers to bypass that work.

Keep the first PR 19 slice focused on the current API, admission, frozen context,
tool catalog, worker, funding, revisions and progress contracts, including
this plan's implemented improvements at that time. Transfer route/worker
ownership coherently, drain or fence active leases, preserve funding settlement,
update ingress and delete replaced Python owners/tests. Retain a bridge only
for a named remaining caller with a deletion condition.

## Delivery slices and acceptance

The identifiers 0–8 above retain historical meaning. Slices A–C are the assigned
first release scope. D and E remain separate later assignments.

| Slice | Scope | Exit evidence |
|---|---|---|
| A. Conversation baseline (implemented) | Scripted questions, clarification, audience corrections, artifact requests and discussion of a user-edited outline | Offline behavior checks distinguish reply-only turns from revision-producing work; existing outline/revision safety coverage retained |
| B. Conversation behavior (implemented) | Operating contract, content/comparison/portfolio skills and prompting aligned; outline enforcement retained | Questions and clarification allow null output; the runtime continues with bounded history and latest user edits |
| C. Chat interaction polish (implemented) | Inherited workflow wording, shared follow-latest behavior, activity disclosure, optional suggestion prefills, drafting during runs and exact submission retry | Full chat and Dashboard use the same owners; component and offline browser coverage exercise reading position, commands, Stop and recovery |
| D. TS Agent baseline | Migration PR 19 in its approved sequence | One writer/worker owner, affected PostgreSQL coverage and migration release gates |
| E. Optional streaming | Persisted progress delivery first; provider text only after its safety/transport contract is ready | Reconnect cannot start/replay a turn; incomplete text cannot become a saved or approved artifact |

A and C can be developed independently. B follows A. A–C are the first release
scope; they do not depend on D or E. Do not bundle new memory, plan execution
or skill administration into this release. Size the slices after a focused
owner/test inventory rather than retaining the original speculative week counts.

Streaming is not required to make the conversation good. Keep polling as the
working baseline. A future SSE read must stream authorized persisted projections,
handle disconnect/reconnect and revoked access, and leave run execution to the
worker. Provider text streaming is a separate problem: the current protocol is
structured JSON and references are filtered before publication. Do not expose raw
partial JSON or unverified text; retain a committed final response as the
authority and preserve cancellation, usage settlement and output atomicity.
Multi-read steps are deferred until measurements justify a protocol change.

## Deferred proposals from the original plan

These are optional later work, not prerequisites for chat refinement:

- **5. Save to Context.** Retain explicit user review and the existing instruction
  revision owner. Do not copy arbitrary generated claims into instructions.
  A future implementation needs a preview, an expected-base revision, idempotent
  save and structured source-message provenance authorized to the same project.
  The current save API accepts only text and has no stale-base check; this is
  not a frontend-only feature. Preferences belong in instructions; company-fact
  corrections go through the existing reviewed brand-profile flow.
- **6. Plan mode.** Defer a durable step runner and approval UI. Today the Agent
  can discuss or write a plan and use existing explicit handoffs. A future
  execution feature needs revision-bound approval, persisted step/child-chat
  links, retry/idempotency rules and fresh authorization/funding per user-started
  step. Approval must not launch an autonomous chain.
- **7. Per-project skill enablement/order.** Keep the current catalog/picker.
  Project policy would need server-side admission/selection enforcement and a
  frozen run snapshot, not just hidden menu entries. User-authored skills remain
  out of scope; evaluation alone does not authorize them.
- **8. Expanded evaluation corpus.** Start with slice A and expand per actual
  skill changes. Offline scoring is a test/release tool, never another model
  call or claim-validator layer in production.

## Validation and completion

For assigned executable slices, follow [AGENTS.md](../../AGENTS.md) and
[Development](../DEVELOPMENT.md). Select the lowest meaningful coverage:

- Scripted runtime cases: question after selecting a content skill produces no
  output; follow-up explanation preserves the current revision; clarification
  then answer continues the task; a requested draft cannot bypass outline
  approval; a real revision uses the latest user-edited body.
- Evidence/boundary cases: absent data remains unavailable; unsupported actions
  are not claimed complete; untrusted evidence cannot become instructions;
  foreign mentions fail authorization; different-output-kind work uses a handoff.
- UI paths: scroll up during polling without being pulled down; recover a failed
  submission without losing text or duplicating a turn; reach Stop and commands
  by keyboard; continue the same panel chat in Agent; preserve current document,
  sources/history, portfolio submission and implementation-declaration behavior.
- Real PostgreSQL coverage when admission, persistence, leases or funding change:
  one active run, workspace isolation, idempotent replay, cancellation/late
  results, membership revocation and settlement. No new source-text snapshots
  or tests that merely restate prompt wording.

Use recorded tool payloads and scripted model responses for deterministic CI.
They establish runtime behavior, not natural-language quality. Separately
evaluate realistic multi-turn conversations for directness, unnecessary
clarification, redundant reads, repetition, relevant skill choice and whether
the user actually completes the task. Live model evaluation is an explicitly
authorized release task, never a CI call with inherited credentials.

Run `./scripts/check.ps1` once after the intended executable diff, plus selected
tests and `git diff --check`; keep logs in the worktree's Git directory. Update
only changed feature/design owners. Live model quality evaluation and deployment
acceptance remain separate from deterministic implementation checks.

## Retained audit decisions

The 29 September audit was guidance, not authority. Foundations accepted and
implemented the catalog freeze, loader bounds, vocabulary single-sourcing,
real tool contracts, differentiation methodology, explicit refusal reasons,
access-revocation handling, frozen time envelope and persisted progress.

The transcript issue was a non-positive slice bound, not string-search splitting.
Model-written summaries do not become durable memory without user promotion.
Reflection/claim-validator calls, autonomous CMS work and publishing remain
excluded. Coding-agent tooling cleanup is outside the production Agent scope.
Gateway consolidation belongs to migration; streaming and multi-read changes
are separate proposals, not automatic additions to PR 19.
