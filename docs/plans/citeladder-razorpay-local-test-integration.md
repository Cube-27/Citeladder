# Razorpay local test integration — pending

The owner retained this as pending work. It is not the active task and does not
authorize a sandbox transaction, payment enablement, deployment or database
reset. The prior provider pause remains an execution boundary until a provider
task explicitly resumes it. Documentation retention is not merchant approval.

[Billing](../billing-entitlements.md) owns shipped commercial behavior;
[provider readiness](../billing-provider-readiness.md) owns acceptance;
[local testing](../operations/razorpay-local-testing.md) owns the existing
isolated procedure. The [historical original](../archive/plans/citeladder-razorpay-local-test-integration.md)
retains the old recovery authorization and implementation record. Do not replay
that authorization on a current database.

## Remaining scope

- Establish the intended provider/environment and merchant capabilities before
  resuming provider work. Keep the provider-neutral core and originating-adapter
  identity of existing intents, subscriptions and receipts.
- Verify real test-mode subscription checkout and callback/webhook convergence,
  INR/USD catalog alignment where supported, recurring methods and lifecycle
  recovery against retained evidence.
- Complete transaction-level GST/provider parity and commercial/tax acceptance;
  currency alone does not establish export treatment.
- Exercise interrupted/abandoned checkout, duplicate/conflicting events,
  cancellation/renewal failure, refunds and bounded reconciliation through the
  existing owners. Test doubles do not establish payment-network behavior.
- Record actual acceptance in the PR/operational evidence; never mark a scenario
  complete because its route or mocked test exists.

## Retained protections

Use the isolated billing-test environment, explicit UUID targets, reviewed
dry-runs and redacted evidence described by the operator runbook. Never put
secrets or payment data on argv. Webhook authentication and paid-period evidence
must precede paid grants. Checkout's kill switch must leave recovery available.

The previous live recovery, onboarding repair and initial catalog provisioning
are historical work, not prerequisites to rerun. Real sandbox captures,
recurring-method acceptance and GST parity remain unverified. Live enablement
requires separate explicit authorization after applicable readiness gates.
