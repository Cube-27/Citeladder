# CiteLadder review checklist

This is a short human/agent review checklist. The canonical rules live in
[`docs/invariants.md`](docs/invariants.md), [`docs/design.md`](docs/design.md),
and the owning runtime documents; this file does not duplicate their examples
or define a second authority.

## Before reviewing

- Identify the owning model, route, schema, config, queue, worker, component,
  test, and document. Search callers and current tests before proposing a new
  abstraction or deletion.
- Compare the change with the current branch and preserve unrelated work.
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
  exact source and policy provenance. Read APIs do not perform repair or I/O.

## Frontend and contracts

- Backend schemas remain the wire-contract source. Update the matching frontend
  schema, API module, query key, fixture, and UI state when a DTO changes.
- Browser calls remain same-origin through `/api/v1`. Use semantic roles,
  labels, keyboard/focus behavior, truthful loading/error states, and shared UI
  owners. Visual token values belong only to `docs/design.md` and its code
  owners; do not add class/font/pixel snapshots as a second design system.
- Consequential actions require explicit user intent. No autonomous publishing,
  prompt activation, billing mutation, or unbounded agent loop is acceptable.

## Validation and test admission

- Repository completion gates run once per task, after the complete intended
  executable diff is finished. Documentation edits, commits, sub-phases,
  handoffs, and intermediate milestones never trigger them. During
  implementation, use only a directly targeted test to debug executable
  behavior currently being changed; `scripts/test.ps1` selects the final
  affected tests. CI retains full owner suites and release/Compose acceptance.
- Changing a file does not by itself require running or adding a test. Add or
  select tests only for a credible regression path at the lowest meaningful
  boundary. Documentation-only changes use cheap textual/reference checks,
  except when the documentation is executable or packaged input.
- Add a test only for a named observable failure. Prefer the lowest meaningful
  layer; preserve unique authorization, money, secret-redaction, unknown/zero,
  API, accessibility, idempotency, and concurrency coverage.
- Remove a test only for intentionally removed behavior, demonstrated retained
  coverage, or an assertion with no remaining contract. Record the rationale in
  the change review; a failing test is not itself redundant.

## Input and extraction boundaries

Apply the durable [input and extraction rules](docs/invariants.md#18-input-and-extraction-boundaries)
when the changed parser, request schema, provider data or settlement can affect them.
