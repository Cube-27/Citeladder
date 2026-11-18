# CiteLadder review checklist

The checklist for a reviewer or an author's check of their own diff. It points at
the rule owners rather than restating them: [invariants](docs/invariants.md) own
the binding constraints, [design](docs/design.md) the visual and interaction
rules, and [engineering guidelines](docs/engineering-guidelines.md) the repeated
failure modes, each with a diff check. Walk the guideline checks that match the
files in the diff.

## Before reviewing

- Establish the intended base/head and review the actual diff, not only its
  summary. Review-only requests do not authorize edits.
- Identify the owning model, route, schema, config, queue, worker, component,
  test and document. Search callers and current tests before proposing a new
  abstraction or deletion.
- Confirm whether a claim is shipped behavior, approved remaining work,
  historical evidence or an external acceptance requirement.

## What to check

- **Invariants.** Walk the [invariant](docs/invariants.md) sections the diff can
  affect, and the [guardrails](CLAUDE.md#guardrails).
- **Boundaries.** Network URLs are scheme/host validated before credentialed
  requests. Secrets stay out of responses, logs, snapshots, browser storage and
  fixtures. Apply the
  [input and extraction rules](docs/invariants.md#18-input-and-extraction-boundaries)
  when a parser, request schema, provider payload or settlement changes.
- **Concurrency.** Integrity, idempotency, leases and lock ordering are verified
  at the real PostgreSQL boundary where they matter.
- **Contracts.** Backend schemas remain the wire-contract source; a DTO change
  updates the matching frontend schema, API module, query key, fixture and UI
  state, and limits come from their owner
  ([guidelines](docs/engineering-guidelines.md#take-limits-from-their-owner)).
- **Frontend.** Semantic roles, labels, keyboard/focus behavior, truthful
  loading/error states and shared UI owners. No class, font or pixel snapshots
  acting as a second design system.
- **Cutover.** Apply the [replacement gate](docs/invariants.md#replacement-and-retirement):
  callers moved to one authority and superseded paths gone. A renamed file or new
  implementation is not proof the old behavior is gone.

## Validation and tests

Judge evidence against the [`validate-change` skill](.claude/skills/validate-change/SKILL.md) and
[CLAUDE.md testing](CLAUDE.md#testing). Review the evidence already
produced rather than launching another completion gate. Confirm it covers the
final executable diff and credible regressions, and that removed tests carry a
rationale. Keep local checks, CI results and external/provider acceptance
separate; one does not prove another.

## Review result

Report actionable findings with file/line evidence, impact and the smallest
appropriate repair, most severe first. Distinguish defects from optional polish
and disclose checks not run. Implementation reports follow
[CLAUDE.md completion](CLAUDE.md#completion).
