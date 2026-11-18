# Payment provider readiness

Runtime/configuration owner; provider acceptance is unchanged.

**Payments are not enabled.** Only the free trial is live.
`BILLING_RAZORPAY_LIVE_READY` is false, `BILLING_CHECKOUT_AUDIENCE` keeps checkout
to allow-listed workspaces, and no real payment has been taken. Nothing in this
repository has been verified against a live payment network.

## Razorpay: approved, hidden, awaiting acceptance

Razorpay approved the merchant, including Subscriptions and international
payments. The commercial core, payment paths and customer surfaces are
implemented and billing runs hidden in production ([B0, B2](billing-decisions.md);
[billing improvement plan](plans/billing-improvement.md)). What remains is
test-mode acceptance through the allow-list, the owner's tax inputs and recorded
live sign-off: see the
[owner requirements](operations/razorpay-and-demo-owner-requirements.md) and the
[payment acceptance backlog](plans/backlog.md#acceptance-calibration-and-rollout).
Enablement is then a configuration change, not code.

Local tests are not evidence that money can be taken correctly. The boundary's
guarantees (fail-closed providers, intent before network I/O, idempotent
settlement, recovery without a second create) are in
[billing and entitlements](billing-entitlements.md#explicit-purchase-to-settlement).
Disabled checkout still permits stored-intent replay and
originating-environment recovery; quote signing uses an independent secret with
no gateway fallback.

## Configuration

[`config/billing.json`](../frontend/services/api/src/config/billing.json) owns
provider-independent execution, tax/seller, operator and Razorpay settings;
[`config/providers.json`](../frontend/services/api/src/config/providers.json)
owns the platform credentials managed plans measure on. The
[GCP runbook](operations/GCP_RUNBOOK.md#13-github-gcp-demo-environment-variables)
lists where production sets each one. The traps:

- `BILLING_CHECKOUT_ENABLED` is the kill switch (default `false`), and
  `BILLING_CHECKOUT_AUDIENCE=allow_list` (default) sells only to workspaces
  holding the non-public `billing_checkout` grant. Test keys in production
  serve allow-listed workspaces only.
- A `BILLING_CHECKOUT_PROVIDER` identity with no registered, configured adapter
  makes new checkout unavailable; it never falls back to another provider.
- Checkout is unavailable when `BILLING_QUOTE_SIGNING_SECRET` is empty or
  equals a Razorpay secret.
- India prices need `BILLING_INDIA_GST_RATE` and
  `BILLING_INDIA_GST_APPROVAL_REFERENCE` together; there is no source default.
  The rate is frozen with each India catalog price, and quotes use that.
- Commercial terms (prices, grants, add-ons and top-ups) are never
  environment settings: they live in the published `BillingCatalogRevision`.

## Adding another provider

1. Add its native settings under `src/config/`, keeping its
   variable names its own.
2. Implement its TypeScript `BillingProvider` operations, webhook authentication
   and checkout signature verification under `src/billing/`.
3. Add explicit provider selection and frozen-record routing under that owner,
   with its own status/event vocabulary; unknown identities must remain unavailable.
4. Point `BILLING_CHECKOUT_PROVIDER` at it.

Then verify its commercial and tax role for the regions it will sell in, pass
its sandbox acceptance, and seek separate authorization before enabling
payments.
