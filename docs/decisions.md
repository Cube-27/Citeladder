# Accepted cross-feature decisions

Keep accepted, still-applicable choices with their reason, scope and actual
source. Feature-local rationale belongs in its feature owner; correctness
rules belong in [invariants](invariants.md). Git and PRs retain superseded history.

## One commercial account per workspace

A workspace owns exactly one billing account. A user owns one workspace and may
join others by invitation; each workspace retains exactly one designated Owner.
Owner and Admin have equal workspace permissions. Billing, member management
and provider/integration credentials are administrative; Member has ordinary
product read/write/run access and Viewer has read-only product access.

This makes tenancy, access and commercial ownership agree without project ACLs,
seat billing or a second account-link entity. Ownership is counted separately
from invited membership. Workspace selection is explicit; project resolution
must still authorize the project's workspace.

Source: owner-confirmed sections 0 and 0.1 of the
[retained original shell plan](archive/plans/citeladder-authed-shell-and-commercial-architecture.md),
implemented in #61 (44fc0d22), with shell selection in #58 (cae5717f).
[Workspace access](workspace-access.md) and [billing](billing-entitlements.md)
own shipped behavior. Sign-in selection and invitation delivery remain deferred.

## Preserve provider portability; do not enable payments

The owner paused completion of Razorpay integration while preserving its adapter
and the option to return or select another provider. The commercial core binds
each intent/subscription/receipt to its originating provider and environment;
vendor keys and webhook vocabulary remain vendor-owned. This avoids rewriting
commercial accounting to change a payment transport.

Source: owner-confirmed section 0 of the
[original shell plan](archive/plans/citeladder-authed-shell-and-commercial-architecture.md),
implemented in #61 (44fc0d22). The current documentation cleanup retains
[Razorpay as pending work](plans/citeladder-razorpay-local-test-integration.md);
that queue choice does not resume provider execution or enable payments.

Real sandbox captures, recurring-method acceptance and GST parity remain
unverified. [Provider readiness](billing-provider-readiness.md) owns the
acceptance and separate enablement boundary.
