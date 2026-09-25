# AGENTS.md — CiteLadder

> Mandatory bootstrap for coding agents. Read this file, then the smallest
> applicable owner document from [the documentation index](docs/README.md).

## Authority and routing

This file owns agent workflow and test admission. [Invariants](docs/invariants.md)
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
  `backend/app/core/config/*` or the owning frontend config, not service code.
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

Run `./scripts/check.ps1` once after the intended executable diff is complete.
It runs all backend/frontend static and contract checks with formatting fixes;
`-CheckOnly` is the non-mutating alternative. [Development](docs/DEVELOPMENT.md)
owns command examples. During iteration, run the smallest relevant native tests.
Authorization, persistence, concurrency and shared runtime changes need stronger
affected-owner coverage. CI owns full selected suites and release validation;
do not run the full backend suite locally instead of selecting relevant tests.

Ordinary copy/documentation edits need only cheap whitespace/reference checks.
Documentation consumed by the application as runtime or packaged input, including
Agent skills and templates, needs validation of the affected consumer instead.

Do not overlap test/check processes or repeat successful runs merely for a commit,
handoff or milestone. If later executable changes invalidate the evidence, rerun
what they affect before claiming completion. Keep test logs in the worktree's Git
directory; report exit status and inspect failure tails first. Open a larger log
section only when the tail is insufficient. The check script already bounds output.

## What earns a test

A test earns its place by failing when behavior regresses and passing when code
is merely rewritten. Test a decision: a branch, boundary, transformation or
module contract. Prefer one real path over separate assertions for every field.

Do not test:

- literal source/config/workflow/documentation text, substring order or formatting;
  assert parsed semantics instead, or use `scripts/quality.mjs` for repository policy;
- field presence or types already guaranteed by the type checker;
- a constant against its copy, or a mapping against a restatement of itself;
- framework behavior rather than CiteLadder's use of it.

For UI, test user-visible behavior and accessibility, not incidental copy,
utility classes, component nesting or full-markup snapshots. Do not multiply
assertions for details already covered by a meaningful path.
`backend/scripts/check_test_shape.py` is a bounded raw-file-assertion guard,
not a substitute for review.

Remove tests only for retired behavior, demonstrated retained coverage or an
assertion with no remaining contract; record the rationale. A failing test is
not itself redundant. Never weaken gates, add exclusions, skip/xfail tests,
raise thresholds or delete meaningful safety coverage to make validation green.

## Repository safety

- Frontend package operations use pnpm only; never create a root lockfile.
- Tests disable dotenv and use deterministic configuration; inherited live
  provider credentials must never reach a test run.
- Pre-launch schema changes stay in `migrations/versions/0001_initial.py` and
  are verified only on disposable data. Never reset shared, staging or production
  data under that policy.
- Never reset, deploy, call live providers, activate payments or mutate external
  systems unless the task explicitly authorizes the operation.
- Use `apply_patch` for code/document edits. Stage explicit paths and preserve
  user-owned changes.

## Completion and review

Inspect `git diff --check`, `git diff --stat` and `git diff --name-status`.
Review the final diff using [Review.md](Review.md). Report changed behavior,
removals for replacements, exact verification commands/results, checks not run,
and unresolved risks. Do not attribute unrelated dirty-tree failures to this work.
For review-only requests, do not edit; report actionable findings with file evidence.
