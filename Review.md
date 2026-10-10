# CiteLadder review checklist

This is the review procedure for humans and agents. It points at the rule owners
rather than restating them: [CLAUDE.md](CLAUDE.md#non-negotiable-guardrails)
summarizes the guardrails, [invariants](docs/invariants.md) own the binding
constraints and [design](docs/design.md) owns visual and interaction rules.

## Before reviewing

- Establish the intended base/head and review the actual diff, not only its
  summary. Review-only requests do not authorize edits.
- Identify the owning model, route, schema, config, queue, worker, component,
  test and document. Search callers and current tests before proposing a new
  abstraction or deletion.
- Confirm whether a claim is shipped behavior, approved remaining work,
  historical evidence or an external acceptance requirement.

## What to check

- **Guardrails and invariants.** Walk the CLAUDE.md guardrails and the invariant
  sections the diff can affect: workspace authorization, read-only reads,
  immutable evidence and provenance, configuration ownership, distinct
  unknown/zero states, same-origin browser APIs and explicit user intent.
- **Boundaries.** Network URLs are scheme/host validated before credentialed
  requests. Secrets stay out of responses, logs, snapshots, browser storage and
  fixtures. Third-party values are validated before coercion; apply the
  [input and extraction rules](docs/invariants.md#18-input-and-extraction-boundaries)
  when a parser, request schema, provider payload or settlement changes.
- **Concurrency.** Integrity, idempotency, leases and lock ordering are verified
  at the real PostgreSQL boundary where they matter.
- **Contracts.** Backend schemas remain the wire-contract source; a DTO change
  updates the matching frontend schema, API module, query key, fixture and UI state.
- **Frontend.** Semantic roles, labels, keyboard/focus behavior, truthful
  loading/error states and shared UI owners. No class, font or pixel snapshots
  acting as a second design system.
- **Cutover.** When behavior is replaced or retired, apply the
  [replacement gate](docs/invariants.md#replacement-and-retirement): callers
  moved to one authority and superseded paths are gone. A retained bridge needs
  its external caller, focused test and removal condition. A renamed file or new
  implementation is not proof the old behavior is gone.

## Validation and tests

Judge evidence against [CLAUDE.md validation](CLAUDE.md#validation) and
the `principle-test-behavior-not-implementation` skill. Review the evidence already
produced rather than launching another completion gate. Confirm it covers the
final executable diff and credible regressions, and that removed tests carry a
rationale. Keep local checks, CI results and external/provider acceptance
separate; one does not prove another.

## Review result

Report actionable findings with file/line evidence, impact and the smallest
appropriate repair, most severe first. Distinguish defects from optional polish
and disclose checks not run. Implementation reports follow
[CLAUDE.md completion](CLAUDE.md#completion-and-review).
