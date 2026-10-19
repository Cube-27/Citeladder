# CLAUDE.md — CiteLadder

> Mandatory bootstrap for coding agents. This file holds only rules that apply
> to every task. Read it, then the smallest applicable owner document from
> [the documentation index](docs/README.md), which also says which document
> answers what.

## Authority and routing

[Invariants](docs/invariants.md) own review-blocking constraints; read the
sections affected by the change. Current code and tests establish shipped
behavior, not permission to violate an accepted constraint: surface
disagreements and repair them within the authorized scope; do not rewrite a
safeguard merely to match a defect. Test design follows the
`principle-test-behavior-not-implementation` skill.

Read a plan only for work assigned to it. An entry in
[plan status](docs/plans/ACTIVE.md) is not execution authorization; never resume
an old wave or fresh-chat protocol because a document mentions it.

Situational workflow rules live in `.claude/skills/`, each in one place:
`validate-change` (what to run and when) and `record-owner-decision` (where
owner answers go). Skills never restate repository
policy owned by a document. Packaged Agent `SKILL.md` files are production
inputs owned by the [Agent](docs/agents.md), not engineering skills.

## Non-negotiable guardrails

- Every project-owned read and write is workspace-authorized. IDs are UUIDs,
  never authorization; do not scope product data by `user_id`.
- Reads render persisted projections, never crawl, sync, call providers/models,
  or repair state. Raw evidence/attempts are append-only; derived results retain
  exact source IDs and relevant processing versions.
- PostgreSQL owns durable state and queues. Preserve leases, idempotency and
  commit-before-network-I/O; do not add Redis without measured need.
- Browser APIs use same-origin `/api/v1`. Tunable policy belongs in
  `frontend/services/api/src/config/` or the owning frontend config, not service code.
- Models may explain, generate, plan or classify bounded ambiguity; they do not
  become raw truth or redefine deterministic metrics. Keep unknown, unavailable,
  zero, historical, conflicting, excluded and not-applicable states distinct.
- The Agent orchestrates existing owners, not a second knowledge store.
  No autonomous publishing, prompt activation, external mutation or unbounded loop.

These are reminders, not a replacement for the affected invariants.

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
5. Update only documentation whose authority changed, following the
   [maintenance rules](docs/README.md#maintaining-documentation). Routine evidence
   belongs in the PR/CI record, not new progress or summary sidecars.

## Validation

Run only the smallest relevant native tests for the behavior at risk; CI runs
the full selected owner suites, every build, E2E and release validation — never
reproduce it locally. Never overlap test/check processes or repeat a successful
run. Before running anything beyond focused tests (including `pnpm gate`), use
the `validate-change` skill.

## Repository safety

- Frontend package operations use pnpm only; never create a root lockfile.
- Never weaken gates, add exclusions, skip/xfail tests, raise thresholds or delete
  meaningful safety coverage to make validation green.
- Tests disable dotenv and use deterministic configuration; inherited live
  provider credentials must never reach a test run.
- Pre-launch schema changes stay in `frontend/services/api/migrations/0001_baseline.sql`
  and are verified on the one local development database (no customers yet; run
  tests with `pnpm test:api <files>`, never create per-branch databases). Only the
  owner resets it. Never reset staging or production data under that policy.
- Never reset, deploy, call live providers, activate payments or mutate external
  systems unless the task explicitly authorizes the operation.
- Edit files with your editing tool (`apply_patch` or equivalent), not shell
  rewrites, heredocs or throwaway edit scripts. Developer and agent workflow
  scripts are Node, run through pnpm (`pnpm gate`, `pnpm test:api`); do not add
  PowerShell or bash scripts for them. Stage explicit paths and preserve user-owned changes.

## Completion

Inspect `git diff --check`, `git diff --stat` and `git diff --name-status`.
Check your own final diff against [Review.md](Review.md). Report changed behavior,
removals for replacements, exact verification commands/results, checks not run,
and unresolved risks. Do not attribute unrelated dirty-tree failures to this work.
For review-only requests, do not edit; report actionable findings with file evidence.
Pull requests get no separate review: no CI review, reviewer agents or
re-review; your check against Review.md is the review.
