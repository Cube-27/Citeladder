# CLAUDE.md — CiteLadder

> Mandatory bootstrap for coding agents. Read this file, then the smallest
> applicable owner document from [the documentation index](docs/README.md).

## Authority and routing

This file owns agent workflow; test design follows the
`principle-test-behavior-not-implementation` skill. [Invariants](docs/invariants.md)
own review-blocking constraints; read the sections affected by the change.
The index routes feature behavior, architecture, design, setup and operations
without requiring a repository-wide documentation read.

Current code and tests establish shipped behavior, not permission to violate an
accepted constraint. Surface disagreements and repair them within the authorized
scope; do not rewrite a safeguard merely to match a defect. The
[architecture](docs/architecture.md) owns the product loop and capability map.

Read a plan only for work assigned to it. An entry in
[plan status](docs/plans/ACTIVE.md) is not execution authorization. Completed
plans and archives are historical evidence; never resume an old wave or
fresh-chat protocol because a document mentions it.

Coding-agent skills may supply tool-specific procedures, not a second copy of
repository policy. Packaged Agent `SKILL.md` files are production inputs,
not redundant engineering skills; their owner is the [Agent](docs/agents.md).

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

Validation has three tiers; each one owns what the one before it skips.

1. **While iterating**, run only the smallest relevant native tests for the
   behavior at risk. The pre-commit hook formats and lints staged files.
   Authorization, persistence, concurrency and shared runtime changes need
   stronger affected-owner coverage.
2. **For changes to contracts, persistence, authorization, concurrency, shared
   runtime, dependencies or build configuration**, run `./scripts/check.ps1`
   once when the executable diff is complete. Use `-All` only for shared-config
   changes or an explicitly requested release check; `-CheckOnly` is non-mutating.
   Routine feature fixes use focused checks for the changed behavior instead.
3. **CI** runs the full selected owner suites, every production build, E2E and
   release validation. Do not reproduce it locally, including the full backend suite.

Ordinary copy/documentation edits need only cheap whitespace/reference checks.
Small styling and layout-only edits need `git diff --check` and the staged
format/lint hook; inspect the affected view when layout is uncertain. Do not
run behavior tests, production builds or the repository quality harness merely
because a file changed. A commit, push, PR or previously changed branch file is
not a reason to repeat validation. Broaden only for a concrete risk or failure
in the current change, and explain that reason before running a costly check.
Documentation consumed by the application as runtime or packaged input, including
Agent skills and templates, needs validation of the affected consumer instead.

Do not overlap test/check processes or repeat successful runs for a commit,
handoff or milestone. If later executable changes invalidate the evidence, rerun
what they affect before claiming completion. `check.ps1` keeps its own bounded
logs; send native test output to one reusable log in the worktree's Git directory
rather than a new file per run. Report exit status and inspect failure tails first.
[Development](docs/DEVELOPMENT.md#repository-validation-harness) owns command details.

## Repository safety

- Frontend package operations use pnpm only; never create a root lockfile.
- Never weaken gates, add exclusions, skip/xfail tests, raise thresholds or delete
  meaningful safety coverage to make validation green.
- Tests disable dotenv and use deterministic configuration; inherited live
  provider credentials must never reach a test run.
- Pre-launch schema changes stay in `frontend/services/api/migrations/0001_baseline.sql`
  and are verified only on disposable data. Never reset shared, staging or production
  data under that policy.
- Never reset, deploy, call live providers, activate payments or mutate external
  systems unless the task explicitly authorizes the operation.
- Edit files with your editing tool (`apply_patch` or equivalent), not shell
  rewrites. Stage explicit paths and preserve user-owned changes.

## Completion and review

Inspect `git diff --check`, `git diff --stat` and `git diff --name-status`.
Review the final diff using [Review.md](Review.md). Report changed behavior,
removals for replacements, exact verification commands/results, checks not run,
and unresolved risks. Do not attribute unrelated dirty-tree failures to this work.
For review-only requests, do not edit; report actionable findings with file evidence.
