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
| Content generation contract | [`docs/architecture.md`](docs/architecture.md), [`docs/backend-architecture.md`](docs/backend-architecture.md) |
| Opportunity and verification contract | [`docs/architecture.md`](docs/architecture.md), [`docs/backend-architecture.md`](docs/backend-architecture.md), [`docs/frontend-architecture.md`](docs/frontend-architecture.md) |
| Demand, integrations, and Visibility | [`docs/visibility-prompt.md`](docs/visibility-prompt.md), [`docs/integrations-traffic-analytics.md`](docs/integrations-traffic-analytics.md) |
| Backend ownership | [`docs/backend-architecture.md`](docs/backend-architecture.md) |
| Frontend routes, state, and composition | [`docs/frontend-architecture.md`](docs/frontend-architecture.md) |
| Visual and interaction rules | [`docs/design.md`](docs/design.md) |
| Cross-stack errors | [`docs/api-error-contract.md`](docs/api-error-contract.md) |
| Review-blocking invariants | [`docs/invariants.md`](docs/invariants.md) |
| Setup and validation | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Operations and release acceptance | [`docs/operations/`](docs/operations/), [`docs/release-checklist.md`](docs/release-checklist.md) |
| Current approved release work | [`docs/README.md`](docs/README.md#active-work) |

Completed rebuild and cutover plans are evidence, not task instructions. Do
not resume a historical wave, fresh-chat protocol, or delivery checkpoint
because a plan file mentions it.

The Next.js-specific rules in [`frontend/AGENTS.md`](frontend/AGENTS.md) apply
when editing the frontend; read the relevant installed Next guide before code
changes there.

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
   changes require workspace-isolation and provenance coverage; concurrency
   changes require the real PostgreSQL boundary.
5. Update an owner document only when its shipped contract, setup command,
   procedure, or approved decision changes. Put routine evidence in the PR/CI
   record; do not create summary/progress/evidence sidecars for small tasks.

## Validation

Repository completion gates run once per task, after the complete intended
executable diff is finished. Documentation edits, commits, sub-phases,
handoffs, and intermediate milestones never trigger completion gates. During
implementation, run only a directly targeted test or command when you are
debugging executable behavior currently being changed; otherwise do not run a
test merely to prove progress or establish intermediate evidence.

Before handoff, from the repository root, run once in order:

```powershell
.\scripts\check.ps1
.\scripts\test.ps1
```

`check.ps1` is read-only by default and checks affected quality owners. Use
`-Scope All` only for an explicit cross-system/release check. Formatting is an
intentional action with `-Fix`; `-CheckOnly` remains a compatibility spelling.
`test.ps1 -PlanOnly` explains the comparison base, changed paths, matched
mappings, broad selections, and resolved files without executing tests.

`-ChangedFiles` is a retry delta only after an earlier `test.ps1` run in the
same task. The runner records failed/interrupted selections in `.git` and a
retry must include previously failed, previously unexecuted, and newly
invalidated owners. An uncertain record requires a fresh full invocation.

There is no test-by-default rule: changing a file does not itself require a
test run or a new test. Select tests because the changed behavior creates a
credible regression path, using the existing mapping and the lowest meaningful
boundary. Documentation-only changes must never invoke backend, frontend,
browser, build, migration, or application test suites unless the documentation
is executable or packaged input, such as a production Content skill.

Do not run the full backend suite locally as a substitute for the harness. CI
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
