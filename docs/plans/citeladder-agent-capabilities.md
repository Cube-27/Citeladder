# Agent capabilities

## Status and authorization

Planned on 29 September 2026 from an external audit of the Agent (skills,
runtime and a competitive comparison with Peec.ai, Searchable, Profound and
other GEO platforms), then rescoped by the owner the same day: deliver an
agentic experience comparable to Peec, Searchable or Notion AI **using only
the reads, skills and data CiteLadder already has** — no new tools, no
uploads, no external mutation — with the UI doing most of the work. The audit
is guidance, not authority; see [triage](#audit-triage).

Foundations and MVP items 1–4 are implemented together in branch
`claude/practical-gates-oq7898` at the owner's direction. Items 5–8 need
owner approval before they start; this plan is not authorization to run them.
The Agent moves to TypeScript in
[TypeScript migration PR 19](citeladder-typescript-migration.md#pr-19-agent-runtime),
so the MVP is deliberately frontend-, config- and skill-heavy: those carry over
unchanged, while new Python surface would be ported twice.

Owner documentation: [Agent](../agents.md). Invariants most affected: 10
(automation stays bounded, durable-memory promotion needs an explicit user
decision), 11 (context is selected and frozen), 12 (no second model call or
claim-validator layer) and 13 (bounded orchestration, no write tool).

## Goal

Make the Agent feel consultative and document-centred: the user sees what it
is doing, can check every claim in one click, works on the deliverable like a
document, and is always offered the sensible next step — while keeping what
already sets CiteLadder apart (funded, leased, append-only, bounded turns over
persisted, deterministic evidence).

## Roadmap

| # | Item | Status | Size |
|---|---|---|---|
| 0 | Foundations: skills contract, run precision, live step progress | Implemented | — |
| 1 | Chat polish | Implemented | ~1 wk |
| 2 | Document canvas for the output | Implemented | 1.5–2 wks |
| 3 | Composer: `/skill` commands and `@` Action mentions | Implemented | ~1 wk |
| 4 | "What should I work on?" briefing | Implemented | ~1 wk |
| 5 | Continuity: Save to Context | Proposed | ~1 wk |
| 6 | Plan mode | Proposed | 1.5–2 wks |
| 7 | Skills gallery with per-project enablement | Proposed | ~1 wk |
| 8 | Agent behavior evaluation corpus | Proposed | ~1 wk |

The MVP is items 0–4 (about 4–5 weeks in total), now implemented; items 5–8
add depth and safety. Item 8 should land before items 4–7 change model input.

### 0. Foundations (implemented)

Skills contract:

- The skill catalog version is a content fingerprint of every packaged model
  input (skills, operating contract, content formats). Admission freezes it on
  the run (`skill_catalog_version`); a turn executed against a different
  catalog (a deploy between queueing and execution) ends with `skills_changed`
  before any model call, as a changed platform model already does.
- Skill bodies may reference an application-owned vocabulary as `{{name}}`.
  The loader expands it from the owner's one listing and refuses an unknown
  name; `prompt_discovery` now takes buyer stages and prompt intents from
  `visibility_prompts.py` (rendered text unchanged, version not bumped).
- The loader bounds each description (1–320 characters) and expanded body
  (14,000 characters) with a file-and-field error.
- A contract test requires every tool a packaged skill names to be offered.
- `list_content_differentiation` gets a methodology home in `ai_visibility`
  (version 2).

Run precision: the per-call time bound is frozen in the run budget; tool
refusals distinguish the last step from a spent tool budget; a run whose
member is gone ends with `access_revoked` instead of a nil-UUID stand-in;
transcript truncation keeps no step text when the head fills the bound;
`AGENT_RUNTIME_VERSION` is `agent-runtime-2`.

Live progress: the chat read returns an active run's committed steps from its
attempt rows (a call in flight, a step without a read, or a read's outcome),
shown under the running indicator. A projection; the runtime writes nothing.

### 1. Chat polish (implemented)

- **Checkable claims.** Each reply's cited evidence renders as chips grouped
  by record kind; a single record links to its own page (an Action, a
  Visibility run), several link to the screen that shows them. The output's
  Sources tab uses the same chips. References come from persisted rows; the
  browser never resolves a record.
- **Copy reply** on every agent reply.
- **Refinements by deliverable kind** (same chat) and **next steps** that open
  a new chat with the skill that takes the work forward (for example a
  diagnosis offers page edits or earned sources; most deliverables offer a
  measurement plan). A next step carries the attached Action and the output's
  title only, never its evidence content.
- **Starter prompts preselect their skill**, so a first question lands on
  the right methodology without a model `select_skill` step.

### 2. Document canvas (implemented)

- The output renders as sections (level 1–3 headings; headings inside code
  fences are content). Outputs with three or more titled sections get a
  contents list.
- **Revise with agent** on any section sends an ordinary follow-up turn scoped
  to that section ("Revise only the section … Keep every other section exactly
  as it is."). The model still returns the complete body, as the protocol
  requires, and the user can check the result with Compare.
- **Edit** on any section edits just that section in place and saves a new
  user revision with every other section byte-for-byte unchanged, on top of
  the revision it started from (a stale base is refused and the text kept).
- **Compare with current** in History shows a line diff from any earlier
  revision to the current one, bounded so a very long output falls back to
  viewing each revision.
- Prompt portfolios keep their dedicated report view.

### 3. Composer: slash commands and mentions (implemented)

- Typing `/` at a word start opens the skill list (the existing catalog, held
  to the chat's output kind) and picks the turn's skill; the token is removed.
- Typing `@` opens the project's open Actions (the existing work-queue read)
  and mentions one; the token becomes `@<label>` and a removable chip. Arrows
  move, Enter or Tab picks, Escape closes (Enter then sends). The menu is an
  ARIA combobox/listbox.
- Mentions are typed: new chats and follow-ups send up to five Action IDs
  (`mentions`). Admission authorizes each to the chat's project (a foreign or
  missing one refuses the turn with `agent_context_unavailable`), stores
  `{kind, id, label}` on the user message (`agent_messages.mentions`), and
  freezes each Action's deterministic diagnosis into the context manifest.
  Opportunities those diagnoses name become citable, as for the attached
  Action. The request fingerprint includes mentions.
- Sent messages show their mentions as links to the Actions.

Pages and Opportunities are reached through Actions (every page target and
Opportunity with a recommendation converges on one); direct page mentions
would need a page search read and are left for later.

### 4. Briefing (implemented)

A "What should I work on?" card on New chat. **Brief me** starts a
`growth_plan` chat that mentions the project's top five open Actions, so their
diagnoses are in its frozen context, and the model reads the rest through the
existing tools. It runs only when the user clicks it: no schedule, no
autonomous run. The Dashboard's landing is the project list, which has no
project scope to brief on, so the card lives in Agent mode.

### 5. Continuity: Save to Context (proposed)

Invariant 10 makes durable-memory promotion an explicit user decision and the
Agent has no second knowledge store. A user may **Save to Context** a
statement from a reply; it appends a revision to the existing Agent
instructions (which the manifest already freezes) with the source message ID.
No model-written summary becomes memory without that action.

### 6. Plan mode (proposed)

Generalize outline-first to a plan output: numbered steps, each naming a skill
and its deliverable; the user approves; each step then starts as its own
funded, user-started turn with visible progress. No autonomous chain.

### 7. Skills gallery (proposed)

Enable or disable packaged skills and set their order per project, frozen on
the run. User-authored skills wait for item 8 to score them; when they come
they are bounded methodology text validated by the same loader and never
exposed through MCP.

### 8. Agent behavior evaluation corpus (proposed)

`docs/evaluations/agent/` with recorded tool payloads and expected behavior per
skill (skill choice, refusal, outline-first, citation discipline) and an
offline scorer over persisted run evidence: protocol violations, unverified
references replaced, budget exhaustion and tool refusals. Live model runs are
an explicit, credential-gated release task, never CI.

### Folded into TypeScript migration PR 19

Streamed reply text (the gateway does not stream today; about a week),
gateway consolidation, multi-read steps and an SSE transport for progress.
The progress projection above is the contract that stream would carry.

## Audit triage

Accepted as audited: catalog-version freeze, real-catalog contract test,
vocabulary single-sourcing, loader bounds, the orphaned differentiation read,
distinct refusal reasons, removal of the nil-UUID fallback in favor of explicit
`access_revoked` termination, frozen time envelope, step
progress, the evaluation corpus.

Reshaped:

- *Transcript split by string search* — `parts.index` matches a whole element,
  so evidence containing the heading cannot mis-split. The real defect was a
  non-positive slice bound; item 0 fixes that.
- *Cross-turn memory as model-written turn summaries* — conflicts with
  invariant 10's explicit promotion rule; replaced by item 5's user action.
- *SSE endpoint* — the UI already polls the persisted chat; item 0 adds the
  projection to that read, and a stream waits for TypeScript PR 19.

Rejected:

- *Reflection step* (a model self-check before responding) — invariant 12
  excludes a second model call or claim-validator layer; citation discipline
  is already enforced deterministically by dropping unverified references.
- *Gateway construction outside the fenced path* — construction reads only
  frozen route data and does not fail on configuration loss; the model call
  that follows is fenced. No change.
- *Autonomous CMS staging and agent-experience site delivery* — external
  mutation and publishing are outside the Agent (invariant 13); an
  approval-gated CMS integration would be its own owner-approved plan.
- *`skills-lock.json` and `.claude/skills` cleanup* — coding-agent tooling,
  not the production skill catalog; out of this plan's scope.

## Validation

Items 0–4: skill loader and prompting unit tests; the Agent runtime component
suite against PostgreSQL (catalog freeze, frozen time bound, live progress,
mentioned Actions frozen into context, foreign mention refused); section,
diff, evidence and composer-command unit tests; chat and new-chat screen tests
(section revise and edit, evidence links, next steps, revision compare, live
progress, `/` and `@` commands, briefing, mention links); and
`node scripts/quality.mjs --mode check --scope all`.
