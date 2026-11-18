# CLAUDE.md — CiteLadder

> Mandatory bootstrap for coding agents. This file holds only rules that apply
> to every task. Read it, then the smallest applicable owner document from
> [the documentation index](docs/README.md), which also says which document
> answers what.

## Authority and routing

[Invariants](docs/invariants.md) own review-blocking constraints; read the
sections affected by the change. Before changing code read
[engineering guidelines](docs/engineering-guidelines.md), the failure modes that
keep coming back; when one repeats, add or sharpen its entry there instead of
writing history into a brief. Current code and tests establish shipped behavior,
not permission to violate an accepted constraint: surface disagreements and
repair them within the authorized scope; do not rewrite a safeguard merely to
match a defect.

Read a plan only for work assigned to it. An entry in
[plan status](docs/plans/ACTIVE.md) is not execution authorization; never resume
an old wave or fresh-chat protocol because a document mentions it.

Situational workflow rules live in `.claude/skills/`: `validate-change` (what to
run and when) and `record-owner-decision` (where owner answers go). Skills never
restate repository policy owned by a document. Packaged Agent `SKILL.md` files
are production inputs owned by the [Agent](docs/agents.md), not engineering
skills.

## Guardrails

The invariants own these; this is the list to check before you start: workspace
authorization on every project-owned read and write (no `user_id` scoping);
reads render persisted projections and never crawl, sync or call a model;
evidence append-only with provenance; PostgreSQL owns state and queues (no
Redis); policy in config, not service code; browser APIs on same-origin
`/api/v1`; unknown, zero, unavailable and not-applicable stay distinct; models
never become raw truth or redefine deterministic metrics; the Agent orchestrates
existing owners and never publishes, activates prompts, mutates externally or
loops unboundedly.

## Implementation workflow

1. Inspect `git status --short` and preserve unrelated work. Locate the existing
   owner and inspect its callers, contracts, types, configuration, persistence
   and relevant tests before adding another file or abstraction.
2. Implement a coherent slice under that owner. Split complex internals without
   creating a parallel model, store, route family, queue or policy authority.
   Keep larger slices dependency-ordered and the repository runnable.
3. For replacement, migration or retirement, apply the
   [replacement gate](docs/invariants.md#replacement-and-retirement): inventory
   old paths before coding and verify the cutover and removals afterward.
4. Add or select coverage for credible regressions at the lowest meaningful
   boundary. Relevant persistence coverage includes workspace isolation and
   provenance; concurrency changes require the real PostgreSQL boundary.
5. Update documentation only as [Documentation](#documentation) says.

## Code taste

- Complexity lives at the boundary. Routes, MCP tools and workers decode input,
  call one owner function and map errors; owners hold the logic; screens render
  persisted projections and stay dumb.
- External data is `unknown`. Parse it once where it enters, with the existing
  zod schema, and infer the type from the schema (`z.infer`). Trust types inside.
  Never hand-write a property-by-property guard where a schema exists.
- Model variants as discriminated unions on a literal `kind` and end each
  `switch` with an exhaustive `never` check. No bags of optional fields.
- No `any`, no `as` except straight after validation; use `satisfies` to check
  a value without widening it. Prefer inferred types, and derive with
  `Pick`/`Omit`/`ReturnType`/`typeof` before declaring a new interface.
- More than two parameters take one object argument, except on hot paths.
- React effects only sync with outside systems. Derive values in render and act
  in event handlers.
- Default to no comment. Write one only for a constraint, quirk or invariant the
  code cannot show: one line where possible, four at most.
- Shipped code logs through the structured logger, never `console.log`.
- If one of these rules conflicts with the task, say so and get the owner's
  sign-off before breaking it.

## Testing

- Test behaviour that can break: workspace isolation and auth, persistence,
  queues, leases and concurrency, billing, parsing, provider translation and
  bug-fix logic. Do not test type-guaranteed behaviour, trivial logic, copy,
  static markup, callback wiring or restated constants.
- Call the subject the way its users do and assert a literal expected value or
  an observable effect. Before keeping a test, ask: would it still pass if every
  function it imports returned `undefined`? If yes, rewrite the assertion or
  delete the test. That rules out weak assertions (`toBeDefined`, `toBeTruthy`,
  `not.toThrow`), mock-call-only checks, expected values computed by the code
  under test, pins of a constant/config/prompt, and fixtures asserting fixtures.
  For an absence, assert the presence on another input in the same test.
- Extend an existing test or table before adding a new case. Test at the lowest
  layer that fails on `main`; don't repeat it in wrappers or callers.
- Logic, data and state bug fixes start with a failing test. Purely visual fixes
  need no test.
- Don't mock what you can run: persistence and concurrency use the real local
  PostgreSQL. No sleeps, polling loops, wall-clock assertions or per-test
  timeouts; await the event or state. A `.skip` needs a reason and an issue link
  on the line above.

Run only the smallest relevant native tests; CI runs everything else. Before
running anything beyond focused tests (including `pnpm gate`), use the
`validate-change` skill.

## Documentation

- Most code changes need no doc change; agents read code.
- Owner docs hold contracts, cross-component constraints, decisions and traps.
  They are not feature catalogues, field lists, file maps or PR summaries.
- A reason the code cannot show goes in a short nearby comment, or in the owner
  doc when it crosses boundaries. Link to the source; don't copy it.
- Each instruction lives in one place. When a documented decision changes,
  rewrite or delete the old text; never append a correction. A new document
  needs a durable reason.
- Routine implementation and validation evidence belongs in the PR or CI
  record, never in progress, summary or evidence sidecars.

## Repository safety

- Frontend package operations use pnpm only; never create a root lockfile.
- Never weaken gates, add exclusions, skip/xfail tests, raise thresholds or delete
  meaningful safety coverage to make validation green.
- Tests disable dotenv and use deterministic configuration; inherited live
  provider credentials must never reach a test run.
- Schema changes follow [invariant 17](docs/invariants.md#17-schema-changes-are-forward-migrations).
  Use the one local development database: bring it forward with
  `pnpm --filter @citeladder/api migrate`, run tests with
  `pnpm test:api <files>`, never create per-branch databases. Never reset
  staging or production data.
- Never reset, deploy, call live providers, activate payments or mutate external
  systems unless the task explicitly authorizes the operation.
- Edit files with the Edit tool, not shell rewrites, heredocs or throwaway edit
  scripts. Developer and agent workflow scripts are Node, run through pnpm; do
  not add bash scripts for them. Stage explicit paths and preserve user-owned
  changes.

## Completion

Inspect `git diff --check`, `git diff --stat` and `git diff --name-status`.
Check your own final diff against [Review.md](Review.md). Report changed behavior,
removals for replacements, exact verification commands/results, checks not run,
and unresolved risks. Do not attribute unrelated dirty-tree failures to this work.
For review-only requests, do not edit; report actionable findings with file evidence.
