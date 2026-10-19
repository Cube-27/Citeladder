---
name: validate-change
description: What to run to validate a CiteLadder change, and when. Invoke before running any check beyond the focused tests for the behavior at risk - pnpm gate, a build, the API suite, E2E, the quality harness - and before validating documentation, copy, styling, runtime-consumed docs or Agent skills.
---

# Validating a change

Validation has three tiers; each one owns what the one before it skips.
[Development](../../../docs/DEVELOPMENT.md#repository-validation-harness) owns
command details.

1. **While iterating**, run only the smallest relevant native tests for the
   behavior at risk. The pre-commit hook formats and lints staged files.
   Authorization, persistence, concurrency and shared runtime changes need
   stronger affected-owner coverage.
2. **For changes to contracts, persistence, authorization, concurrency, shared
   runtime, dependencies or build configuration**, run `pnpm gate` (from
   `frontend/`) once when the executable diff is complete. Add `--scope all
   --builds all` only for shared-config changes or an explicitly requested
   release check; `--mode check` is non-mutating.
   Routine feature fixes use focused checks for the changed behavior instead.
3. **CI** runs the full selected owner suites, every production build, E2E and
   release validation. Do not reproduce it locally, including the full backend suite.

## Proportional checks

- Ordinary copy/documentation edits need only cheap whitespace/reference checks.
- Small styling and layout-only edits need `git diff --check` and the staged
  format/lint hook; inspect the affected view when layout is uncertain.
- Do not run behavior tests, production builds or the repository quality harness
  merely because a file changed. A commit, push, PR or previously changed branch
  file is not a reason to repeat validation.
- Broaden only for a concrete risk or failure in the current change, and explain
  that reason before running a costly check.
- Documentation consumed by the application as runtime or packaged input,
  including Agent skills and templates, needs validation of the affected consumer
  instead.

## Running checks

- Do not overlap test/check processes or repeat successful runs for a commit,
  handoff or milestone. If later executable changes invalidate the evidence,
  rerun what they affect before claiming completion.
- `pnpm gate` keeps its own bounded logs and waits for a machine-wide check slot.
  Send native test output to one reusable log in the worktree's Git directory
  rather than a new file per run.
- Report exit status and inspect failure tails first.
