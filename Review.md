# CiteLadder review checklist

This is a short human/agent review checklist. The canonical rules live in
[`docs/invariants.md`](docs/invariants.md), [`docs/design.md`](docs/design.md),
and the owning runtime documents; this file does not duplicate their examples
or define a second authority.

## Before reviewing

- Identify the owning model, route, schema, config, queue, worker, component,
  test, and document. Search callers and current tests before proposing a new
  abstraction or deletion.
- Establish the intended base/head and review the actual diff, not only its
  summary. Preserve unrelated work; review-only requests do not authorize edits.
- Confirm whether the claim is shipped behavior, approved remaining work,
  historical evidence, or an external acceptance requirement.

## Safety and correctness

- Configuration, limits, thresholds, provider routes, and operational tuning
  come from the approved config owner; fixed structural validation bounds are
  not tunable configuration.
- Network URLs are scheme/host validated before credentialed requests. Secrets
  stay out of responses, logs, snapshots, browser storage, and test fixtures.
- API and worker reads/writes enforce workspace membership. Database integrity,
  idempotency, leases, lock ordering, and concurrency are checked at the real
  PostgreSQL boundary where they matter.
- Third-party values are validated before coercion. Unknown, unavailable,
  not-applicable, historical, conflicting, and observed zero remain distinct.
- Raw evidence and provider attempts are immutable; derived results retain
  exact source and policy provenance. Read APIs do not acquire evidence or
  repair state.

## Frontend and contracts

- Backend schemas remain the wire-contract source. Update the matching frontend
  schema, API module, query key, fixture, and UI state when a DTO changes.
- Browser calls remain same-origin through `/api/v1`. Use semantic roles,
  labels, keyboard/focus behavior, truthful loading/error states, and shared UI
  owners. Visual token values belong only to `docs/design.md` and its code
  owners; do not add class/font/pixel snapshots as a second design system.
- Consequential actions require explicit user intent. No autonomous publishing,
  prompt activation, billing mutation, or unbounded agent loop is acceptable.

## Ownership and cutover

Check [the replacement gate](docs/invariants.md#replacement-and-retirement) when
behavior is replaced or retired. Confirm callers moved to one authority and
superseded paths were removed. Any retained bridge needs its external caller,
focused test and concrete removal condition. Do not treat a renamed file or
new implementation as proof that the old behavior is gone.

## Validation and test admission

Use [AGENTS.md](AGENTS.md#validation) for validation scope and
[its test-admission rules](AGENTS.md#what-earns-a-test) for test value.
[Development](docs/DEVELOPMENT.md#repository-validation-harness) owns commands.
Review the evidence rather than launching duplicate completion gates.

Check that evidence covers the final executable diff and credible regressions.
Preserve unique authorization, money, secret-redaction, unknown/zero, API,
accessibility, idempotency and concurrency coverage. Review the rationale for
removed tests; a failing test is not itself redundant. Separate local checks,
CI results and external/provider acceptance rather than claiming one proves another.

## Input and extraction boundaries

Apply the durable [input and extraction rules](docs/invariants.md#18-input-and-extraction-boundaries)
when the changed parser, request schema, provider data or settlement can affect them.

## Review result

Report actionable findings with file/line evidence, impact and the smallest
appropriate repair. Distinguish defects from optional polish and disclose checks
not run. For implementations, report the changes, replacement removals, exact
verification results and any intentional coexistence or unresolved risk.
