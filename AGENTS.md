# Agents.md — CiteLadder

> Mandatory bootstrap for coding agents. Read this file, then the smallest
> applicable owner document from [`docs/README.md`](docs/README.md).

## Product boundary

CiteLadder connects owned-site, demand, and answer-engine evidence through one
loop: Connect → Analyze → Act → Improve / Verify → Track. Site Health, Content
Intelligence, Demand Intelligence, and the Growth Agent are the durable owners;
AI Visibility is the Track capability. The measured outcome is observed
mention/citation share under comparable audits, not causal proof.

The Growth Agent orchestrates typed tools over those owners. It owns no second
knowledge store and cannot publish, activate prompts, or mutate external
systems without an explicit user action.

## Authority and routing

[`docs/README.md`](docs/README.md) is the documentation index. Use current
code and tests for shipped behavior; archived material is historical only.

| Need | Owner |
|---|---|
| Architecture and product loop | [`docs/architecture.md`](docs/architecture.md) |
| Site Health crawl, classification, rules, and runtime | [`docs/site-health.md`](docs/site-health.md) |
| Feature behavior and dependencies | Feature owners in [`docs/README.md`](docs/README.md#feature-owners) |
| Demand, integrations, and Visibility | [`docs/visibility-prompt.md`](docs/visibility-prompt.md), [`docs/integrations-traffic-analytics.md`](docs/integrations-traffic-analytics.md) |
| Backend ownership | [`docs/backend-architecture.md`](docs/backend-architecture.md) |
| Frontend routes, state, and composition | [`docs/frontend-architecture.md`](docs/frontend-architecture.md) |
| Visual and interaction rules | [`docs/design.md`](docs/design.md) |
| Cross-stack errors | [`docs/api-error-contract.md`](docs/api-error-contract.md) |
| Review-blocking invariants | [`docs/invariants.md`](docs/invariants.md) |
| Setup and validation | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Operations and release acceptance | [`docs/operations/`](docs/operations/), [`docs/release-checklist.md`](docs/release-checklist.md) |
| Current approved release work | [`docs/plans/ACTIVE.md`](docs/plans/ACTIVE.md) |
| Accepted cross-feature decisions | [`docs/decisions.md`](docs/decisions.md) |

Completed rebuild and cutover plans are evidence, not task instructions. Do
not resume a historical wave, fresh-chat protocol, or delivery checkpoint
because a plan file mentions it.

## Non-negotiable invariants

- All IDs are UUIDs. Every project-owned query is workspace-authorized; never
  scope product data by `user_id` or trust an object ID alone.
- Browser APIs use same-origin `/api/v1` through the frontend proxy.
- Tunable configuration, catalogs, thresholds, limits, schedules, templates,
  and page profiles live in `backend/app/core/config/*` or the owning frontend
  config—not service code.
- Raw evidence and provider attempts are append-only. Derived rows retain exact
  source IDs and relevant extractor, classifier, analyzer, rule, formula,
  template, or model versions.
- Reads render persisted projections. They never crawl, sync, call a provider
  or model, or repair state.
- PostgreSQL is durable state and the queue. Claim with
  `FOR UPDATE SKIP LOCKED`, commit before network I/O, and use leases and
  idempotency. Do not add Redis without measured need.
- Models may explain, classify bounded ambiguity, plan, or generate. They never
  become raw truth or change deterministic metrics.
- Unknown, unavailable, zero, historical, conflicting, not-applicable, and
  excluded are distinct states.
- Tests disable dotenv and use deterministic configuration. A real provider
  key must never reach a test run.
- No autonomous publishing, prompt activation, external mutation, or unbounded
  agent loop.

## Implementation workflow

1. Search for the current owner before adding a model, route, service, config,
   queue, parser, component, test, or document.
2. Inspect the target’s callers, tests, types, persistence, and API contract.
3. Implement one coherent slice in the existing owner and preserve unrelated
   work in a dirty tree.
4. Add deterministic coverage at the lowest meaningful boundary. Persistence
   changes and other behaviour changes need coverage only for credible regressions;
   persistence coverage includes workspace isolation and provenance; concurrency
   changes require the real PostgreSQL boundary.
5. Update an owner document only when its shipped contract, setup command,
   procedure, or approved decision changes. Put routine evidence in the PR/CI
   record; do not create summary/progress/evidence sidecars for small tasks.

Read an assigned plan only for work assigned to that plan; material under
[`docs/archive/`](docs/archive/) is opt-in history, not task authority. Update a feature owner
only when its contract or mental model changes; update
[`docs/plans/ACTIVE.md`](docs/plans/ACTIVE.md) only when plan selection,
queue, blocker, or completion state changes; update
[`docs/decisions.md`](docs/decisions.md) only for a changed qualifying
cross-feature decision. Routine implementation and validation history stays
in the PR; there is no blanket multi-file documentation checklist per edit.

## Validation

Run `./scripts/check.ps1` once when executable changes are complete. It runs all
backend/frontend static and contract checks and applies formatting fixes.
Use `-CheckOnly` for non-mutating CI validation. Do not run checks for copy-only
or documentation-only edits.

For behavior changes, add coverage only for credible regressions and run the
smallest relevant tests directly with pytest, Vitest via `vp test` (frontend),
Node, or Playwright.
Authorization, persistence, concurrency, and shared runtime changes require
stronger affected-owner coverage. CI owns full release validation.

Do not launch overlapping test/check processes or repeat successful runs merely
for a commit or handoff. Redirect test output to a log under the worktree's Git
directory; report the exit status and read only the failure tail when a run
fails. Read a larger log section only when the tail does not explain the failure.
The check script already keeps full logs there and prints bounded failure tails.

## What earns a test

A test earns its place by failing when a behaviour regresses and passing when
the code is merely rewritten. Write one for a decision the code makes: a
branch, a boundary, a transformation, a contract between two modules. Prefer
one test that exercises a real path over several that each assert one field.

Do not write a test that asserts:

- the text of a source, config, workflow, or documentation file -- substring
  presence, substring ordering, or formatting. It breaks on a reformat and
  passes on a semantic break. Assert on the parsed structure instead, or make
  it a policy check under `scripts/quality.mjs` where it belongs.
- what the type checker already guarantees, such as a field's presence or type
  on a typed model.
- a constant against a copy of itself, or a mapping against a restatement of
  the same mapping.
- framework behaviour rather than our use of it.

For UI, test user-visible behaviour and accessibility contracts, not incidental
copy, utility classes, component nesting or snapshots of the entire markup.
Do not multiply assertions for details already covered by one meaningful path.

`backend/scripts/check_test_shape.py` catches direct raw-file assertions; it is
a bounded guard, not a substitute for review. An added
test that only restates the implementation is worse than no test: it costs a
run on every change and defends nothing.

Do not run the full backend suite locally as a substitute for choosing relevant tests. CI
runs full selected owner suites, contract/build/security checks, and the clean
Compose validation required by the event. Never weaken a gate, add exclusions,
skip/xfail a test, increase thresholds, or delete meaningful safety coverage to
make validation green.

## Repository safety

- Frontend package operations use pnpm only; never create a root lockfile.
- Pre-launch schema changes are folded into
  `migrations/versions/0001_initial.py` and verified only on disposable data.
- Never reset, deploy, call live providers, activate payments, or mutate
  external systems unless the task explicitly authorizes that operation.
- Use `apply_patch` for code/document edits and preserve user-owned changes.
