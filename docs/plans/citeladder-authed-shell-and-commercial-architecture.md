# Authenticated shell and commercial ownership — retained follow-up

Implementation delivered through #58 (cae5717f) and #61 (44fc0d22), with later
shell corrections. This retained plan is not active and is not a third pending
implementation assignment. The owner retained it for its deferred items.

## Remaining items

- Multi-workspace selection at sign-in was wanted but explicitly deferred.
  The existing in-app switcher and authorized project resolution remain the
  runtime; do not ship a partial replacement or infer a new selection policy.
- Invitation delivery awaits a mail transport owner. Persisted invitations,
  acceptance and role management already exist; do not create a second
  membership model to add delivery.

No new schedule or execution approval is established for these items.

## Current owners and accepted decisions

[Workspace access](../workspace-access.md) owns session, selection, membership
and role behavior. [Billing](../billing-entitlements.md) owns the one-account
per-workspace commercial model and provider-neutral settlement.
[Decisions](../decisions.md) records accepted cross-feature choices.
[Provider readiness](../billing-provider-readiness.md) retains external gates.

The [historical original](../archive/plans/citeladder-authed-shell-and-commercial-architecture.md)
preserves owner-confirmed decisions in sections 0 and 0.1, the delivery sequence,
and the code/acceptance distinction. Its past implementation instructions and
recovery permissions are not current task authority.
