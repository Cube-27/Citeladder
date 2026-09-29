# Agent capabilities

## Status and authorization

Planned on 29 September 2026 from an external audit of the Agent (skills,
runtime and a competitive comparison with Peec.ai, Searchable, Profound and
other GEO platforms). The audit is guidance, not authority: every finding was
checked against the code and the [invariants](../invariants.md) before it was
accepted, reshaped or rejected (see [triage](#audit-triage)).

PR 1 is implemented in branch `claude/practical-gates-oq7898`. Later PRs need
owner approval before they start; this plan is not authorization to run them.
The Agent moves to TypeScript in
[TypeScript migration PR 19](citeladder-typescript-migration.md#pr-19-agent-runtime),
so every PR here keeps new Python surface small and carries its contract
(persisted rows, config, skill files, API shapes) rather than Python-only
mechanisms that PR 19 would have to port twice.

Owner documentation: [Agent](../agents.md). Invariants most affected: 10
(automation stays bounded, durable-memory promotion needs an explicit user
decision), 11 (context is selected and frozen), 12 (no second model call or
claim-validator layer) and 13 (bounded orchestration, no write tool).

## Goal

Keep what the audit found strongest (funded, leased, append-only, bounded
turns over persisted evidence) and close the gaps users feel: an opaque wait
while a turn runs, skills whose provenance and tool references are not
checked, no continuity between chats, and no measurement of model behavior.

## PR 1 — Skills contract, run precision and live progress (implemented)

Skills contract:

- The skill catalog version is a content fingerprint of every packaged model
  input (skills, operating contract, content formats), not a hand-bumped
  string. Admission freezes it on the run (`skill_catalog_version`); a turn
  executed against a different catalog (a deploy between queueing and
  execution) ends with `skills_changed` before any model call, as a changed
  platform model already does. This makes the documented freeze true.
- Skill bodies may reference an application-owned vocabulary as `{{name}}`.
  The loader expands it from the owner's one listing and refuses an unknown
  name. `prompt_discovery` now takes buyer stages and prompt intents from
  `visibility_prompts.py` instead of a hand copy. The rendered model input is
  unchanged, so the skill version is not bumped.
- The loader bounds each description (1–320 characters) and expanded body
  (14,000 characters) with a file-and-field error.
- A contract test loads the real catalog and requires every tool a skill or
  the operating contract names to be offered to the Agent.
- `list_content_differentiation` gets a methodology home in the
  `ai_visibility` skill (version 2): when to read it, how to quote its
  inspected-page denominators, and that a missing report is unavailable.

Run precision:

- The per-call time bound is frozen in the run budget with the step and tool
  budgets; each model attempt's deadline and timeout come from it.
- A tool refusal distinguishes the last step from a spent tool budget.
- A run whose member is gone ends with `access_revoked` instead of running
  tools as a nil-UUID stand-in.
- Transcript truncation keeps no step text when the head alone fills the
  bound (a zero-length slice previously re-appended the whole transcript).
- `AGENT_RUNTIME_VERSION` is `agent-runtime-2`.

Live progress:

- The chat read returns, for an active run, the committed steps of its current
  attempt from `AgentModelAttempt`/`AgentToolAttempt` rows: a call in flight,
  a step that returned without a read, or a read's outcome. It is a projection;
  the runtime writes nothing extra. The conversation shows it under the
  running indicator, so a long turn is no longer a blind wait.

## Later PRs (proposed, not authorized)

Ordered by user value against invariant and migration risk.

### PR 2 — Agent behavior evaluation corpus

Nothing measures the model today; component tests use a scripted gateway. Add
`docs/evaluations/agent/` with recorded tool payloads and expected behavior per
skill (skill choice, refusal, outline-first, citation discipline), and an
offline scorer over persisted run evidence: protocol-violation rate,
unverified-reference replacements, budget exhaustion and tool refusals. Live
model runs are an explicit, credential-gated release task, never CI. This is
the prerequisite for PRs 3–6 changing model input safely.

### PR 3 — Chat continuity (bounded memory)

Invariant 10 makes durable-memory promotion an explicit user decision, and the
Agent has no second knowledge store. So:

- Within a chat, keep deterministic continuity: the history window already
  carries the conversation; add the chat's cited evidence references and the
  output's revision summary to the frozen manifest, derived from persisted rows.
- Across chats, a user may **Save to Context** a statement from a reply. It
  appends a revision to the existing Agent instructions (the reviewed project
  context the manifest already freezes) with the source message ID. No
  model-written summary becomes memory without that action.

### PR 4 — Plan mode for multi-step work

Generalize outline-first to a plan output: the Agent proposes numbered steps,
each naming a skill and its deliverable; the user approves; each step then
runs as its own funded turn in a new or the same chat, with visible progress.
Execution stays per-turn and user-started (no unbounded loop, no autonomous
chain); approval is recorded like an outline approval.

### PR 5 — Skills as a user-visible surface

Project-scoped skill configuration: enable or disable a packaged skill and set
its order, frozen on the run. User-authored skills are deferred until PR 2 can
score them; when they come they are bounded methodology text validated by the
same loader, never policy, and never exposed through MCP.

### PR 6 — Skill-scoped tool catalogs

Each skill declares the tools it needs in frontmatter (validated against the
registry by the loader); the system prompt lists only those plus a small
shared set. Keeps per-step input bounded as the registry grows.

### PR 7 — Governance view

A workspace-admin audit view over the existing append-only attempt rows: who
ran the Agent, which reads it made, the funding source and the settled cost.
No new storage.

### Folded into TypeScript migration PR 19

Gateway consolidation (the Python and TypeScript OpenAI-compatible clients),
multi-read steps, and a streaming (SSE) transport for progress belong with the
runtime's move to TypeScript rather than a Python implementation first. The
progress projection in PR 1 is the contract that stream would carry.

## Audit triage

Accepted as audited: catalog-version freeze, real-catalog contract test,
vocabulary single-sourcing, loader bounds, the orphaned differentiation read,
distinct refusal reasons, nil-UUID fallback, frozen time envelope, step
progress, the evaluation corpus.

Reshaped:

- *Transcript split by string search* — `parts.index` matches a whole element,
  so evidence containing the heading cannot mis-split. The real defect was a
  non-positive slice bound; PR 1 fixes that.
- *Cross-turn memory as model-written turn summaries* — conflicts with
  invariant 10's explicit promotion rule; replaced by PR 3's user action.
- *SSE endpoint* — the UI already polls the persisted chat; PR 1 adds the
  projection to that read, and a stream waits for PR 19.

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

PR 1: skill loader and prompting unit tests, the Agent runtime component suite
against PostgreSQL (catalog freeze, frozen time bound, live progress), the chat
screen tests, and `node scripts/quality.mjs --mode check --scope all`.
