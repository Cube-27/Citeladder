# Payment provider readiness

Status as of 11 September 2026.

**Payments are not enabled.** `BILLING_CHECKOUT_ENABLED` is false, no provider
is configured, and no real payment has ever been taken. Nothing in this
document says otherwise, and nothing in this repository has been verified
against a live payment network.

What shipped is the provider-NEUTRAL architecture of the plan's Phase 3: the
commercial core no longer depends on any one vendor, so selecting a provider
later is an adapter and a configuration block rather than a rewrite. This is a
boundary, proved locally with test doubles. It is not an integration.

## Razorpay: PAUSED, code-complete in parts, externally unverified

Razorpay rejected CiteLadder; discussions continue. Its working integration
code is preserved behind its adapter so returning to it costs a configuration
change, not a re-implementation. **Its outstanding integration work is
deliberately NOT done and must not be picked up without a separate task and
separate authorization:**

- hosted checkout completion and its browser acceptance;
- GST / provider tax-parity work;
- international payment support;
- recurring payment methods;
- merchant-account approval;
- the callback tunnel for local development;
- merchant provisioning;
- any sandbox transaction.

Everything below that is marked "verified" is verified by LOCAL tests only.
None of it is evidence that money can be taken correctly.

## What the boundary guarantees today

| Guarantee | Where it is enforced | Verified by |
| --- | --- | --- |
| The app, workspace billing reads and public pricing work with NO provider configured | `core/config/billing_catalog.region_checkout_ready` | `test_provider_boundary.py` |
| An unknown or unconfigured provider returns a safe unavailable result BEFORE any provider I/O, and never falls back to Razorpay | `connectors/billing/registry.resolve_binding` | `test_provider_boundary.py` |
| A new intent freezes its provider AND environment before any network call | `domain/billing/idempotency.commit_intent` | `test_provider_boundary.py` |
| Changing the new-checkout default leaves prior records on their originating adapter | `connectors/billing/factory.provider_for_record` | `test_provider_boundary.py` |
| A record created in one environment is never served by another | `registry.binding_for_record` | `test_provider_boundary.py` |
| Equivalent external ids in different providers/environments do not collide | `(provider, provider_mode, external_*)` unique constraints | `test_provider_boundary.py` |
| Webhook authentication is provider-specific and vendor headers keep their real names | `connectors/billing/razorpay_webhook`, `api/billing.provider_webhook` | `test_provider_boundary.py` |
| Duplicate webhook delivery grants once, per (provider, environment, event id) | `domain/billing/webhooks._record_event` | `test_provider_boundary.py` |
| Status and event vocabulary stay inside their adapter | `ProviderRegistration.normalize_subscription_status` / `.is_payment_event` | `test_provider_boundary.py` |
| An uncertain creation is never retried against a different provider | reconciliation binds to the persisted pair | `test_provider_boundary.py` |
| The quote-signing secret is independent of EVERY provider's gateway secrets | `domain/billing/quotes._quote_secret` | `test_provider_boundary.py` |

## Configuration

Shared, provider-independent (`core/config/billing_settings.py`):

- `BILLING_CHECKOUT_ENABLED` — the operational kill switch.
- `BILLING_CHECKOUT_PROVIDER` — which provider identity admits NEW checkout.
  An identity with no registered, configured adapter makes new checkout
  unavailable; it never falls back to another provider.
- `BILLING_QUOTE_SIGNING_SECRET` — independent, with no gateway fallback.
- the commercial catalog inputs, the HTTP pool, and the sweep bounds.

Razorpay-owned (`core/config/razorpay_settings.py`): `BILLING_RAZORPAY_MODE`,
`BILLING_RAZORPAY_KEY_ID`, `BILLING_RAZORPAY_KEY_SECRET`,
`BILLING_RAZORPAY_WEBHOOK_SECRET`, the readiness flags, the fixed API origin
and the checkout hosts. **The variable names are unchanged** — the block moved,
nothing was renamed into a generic name whose meaning would shift if a
different provider were selected.

## Adding a provider (when one is actually selected)

1. Write its settings module beside `razorpay_settings.py`, keeping its
   variable names its own.
2. Write its adapter: the `BillingProvider` calls, a `BillingWebhookVerifier`,
   and a `BillingCheckoutAdapter`.
3. Register it in `connectors/billing/factory.py` — one explicit entry,
   including its own status map and payment-event predicate.
4. Point `BILLING_CHECKOUT_PROVIDER` at it.

Then, and only then: verify its commercial and tax role for the regions it will
sell in, pass its sandbox acceptance, and **seek separate authorization before
enabling payments**. That applies equally to returning to Razorpay.

There is no live customer data and no live subscription, so no migration
tooling is needed or should be built.
