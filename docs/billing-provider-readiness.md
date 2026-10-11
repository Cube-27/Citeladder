# Payment provider readiness

Runtime/configuration owner updated on 2 October 2026; provider acceptance is unchanged.

**Payments are not enabled.** `BILLING_RAZORPAY_LIVE_READY` is false,
`BILLING_CHECKOUT_AUDIENCE` keeps checkout to allow-listed workspaces, and no
real payment has been taken.
Nothing in this repository has been verified against a live payment network.

## Razorpay: approved, being activated

Razorpay approved the merchant, including Subscriptions and international
payments. Activation follows the
[payment acceptance backlog](plans/backlog.md#acceptance-calibration-and-rollout): PR A
(commercial core) implements the launch catalog, currency rule, tax,
documents and entitlements with checkout still off; PR B connects the payment
paths; PR C builds the customer surfaces (all three implemented); test-mode acceptance and the live
sign-off come last. Enablement still requires recorded live sign-off.

Everything below marked "verified" is verified by LOCAL tests only. None of it
is evidence that money can be taken correctly.

## What the boundary guarantees today

| Guarantee                                                                                 | Where it is enforced                                              | Verified by                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| Unknown or unconfigured providers fail closed before transport, without fallback          | `src/billing/razorpay.ts`                                         | `billing-boundaries.test.ts` |
| A new intent commits its provider/environment and frozen terms before network I/O         | `src/billing/purchases.ts`                                        | `billing.test.ts`            |
| Disabled checkout still permits stored-intent replay and originating-environment recovery | `src/billing/purchases.ts`, `src/billing/recovery.ts`             | `billing.test.ts`            |
| Foreign environments cannot cancel or settle a record                                     | Frozen provider/mode checks in purchases, settlement and receipts | `billing.test.ts`            |
| Webhook authentication uses bounded exact bytes and vendor headers                        | `src/billing/webhooks.ts`                                         | `billing.test.ts`            |
| Duplicate events settle once; conflicting event digests quarantine                        | `src/billing/webhooks.ts`, shared settlement                      | `billing.test.ts`            |
| Recurring paid evidence binds the captured payment to its subscription invoice and period | `src/billing/razorpay.ts`                                         | `billing-boundaries.test.ts` |
| Uncertain creation is recovered without another create request                            | `src/billing/recovery.ts`                                         | `billing.test.ts`            |
| Quote signing uses an independent secret with no gateway fallback                         | `src/billing/razorpay.ts`                                         | `billing-boundaries.test.ts` |

Paths above are relative to `frontend/services/api/`. Native config owns billing
execution, authoring, tax/seller policy and read-only operator credentials.
The SQL schema baseline and its TypeScript migrate CLI own the schema. Identity,
bootstrap, seeding and grants are native. Public pricing
and billing reads consume persisted state without provider calls.

## Configuration

Provider-independent execution, tax/seller and operator policy lives in
`frontend/services/api/src/config/billing.json`:

- `BILLING_CHECKOUT_ENABLED` — the operational kill switch (default `false`).
- `BILLING_CHECKOUT_AUDIENCE` — `allow_list` (default) sells only to
  workspaces holding the non-public `billing_checkout` grant; `everyone` opens
  checkout. Test keys in production serve allow-listed workspaces only.
- `BILLING_CHECKOUT_PROVIDER` — which provider identity admits NEW checkout.
  An identity with no registered, configured adapter makes new checkout
  unavailable; it never falls back to another provider.
- `BILLING_QUOTE_SIGNING_SECRET` — independent, with no gateway fallback;
  checkout is unavailable when it is empty or equals a Razorpay secret.
- `BILLING_INDIA_GST_RATE` and `BILLING_INDIA_GST_APPROVAL_REFERENCE` —
  required together to author India prices; there is no source default. The
  rate is frozen with each India catalog price, and quotes use that.
- the seller identity (legal name, address, email, GSTIN and state default to
  the recorded values; `BILLING_SELLER_SAC` and `BILLING_SELLER_LUT_REFERENCE`
  are owner inputs), the invoice prefix and the HTTP timeout.
- `BILLING_CANCELLATION_SEND_LEAD_SECONDS` — how long before renewal a held
  cancellation is sent to the provider (default two days).
- `BILLING_FUNDED_MONTHLY_BUDGET_MINOR` — the managed-plan monthly platform
  spend ceiling.
- the trial length and purge, quote validity, subscription cycles, and the
  reconciliation and webhook bounds.

Commercial terms (prices, grants, add-ons and top-ups) are never
environment settings: they live in the published `BillingCatalogRevision`.
The contact-sales display URL is configured by `BILLING_CONTACT_SALES_URL`.

Razorpay-owned settings, in the same file: `BILLING_RAZORPAY_MODE`
(`disabled`, `test` or `live`), `BILLING_RAZORPAY_KEY_ID`,
`BILLING_RAZORPAY_KEY_SECRET`, `BILLING_RAZORPAY_WEBHOOK_SECRET`, the
rotation-only `BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET` with its
`…_STARTED_AT`/`…_EXPIRES_AT` window, the fixed API origin, and the readiness
flags: `BILLING_RAZORPAY_TEST_READY`, `BILLING_RAZORPAY_TEST_INTERNATIONAL_READY`
and `BILLING_RAZORPAY_TEST_INDIA_READY` in test mode,
`BILLING_RAZORPAY_LIVE_READY` and `BILLING_RAZORPAY_INTERNATIONAL_READY` in
live mode (the live INR route needs no regional flag). Managed plans measure on
the platform credentials in `frontend/services/api/src/config/providers.json`:
`PROVIDER_PLATFORM_<TRANSPORT>_CREDENTIAL_REF` with
`PROVIDER_PLATFORM_<TRANSPORT>_API_KEY` for OpenAI, Google and Anthropic, and
`DATAFORSEO_PLATFORM_CREDENTIAL_REF` with the `DATAFORSEO_API_*` pair. The
[GCP runbook](operations/GCP_RUNBOOK.md#13-github-gcp-demo-environment-variables)
lists where production sets each one.

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
