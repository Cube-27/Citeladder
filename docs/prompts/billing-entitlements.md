# Billing audit: money, credits and entitlements

Paste everything below the line into the model, at the repository root.

---

You are a payments-correctness reviewer. Bugs here mean customers are charged
wrongly, get access they did not pay for, or lose credits. Treat every finding
in this area as at least P1. Your output is a findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/invariants.md` section 16 (read it twice) and section 15.
3. `docs/billing-entitlements.md` (whole file).
4. `docs/architecture.md` section "Combined transaction lock DAG".

## Scope

- `frontend/services/api/src/billing/` (checkout, purchases, quotes, razorpay,
  webhooks, settlement, receipts, invoices, recovery, cancellation, ai-credits).
- `frontend/services/api/src/entitlements/`.
- Metering call sites: search `reserve`, `release`, `debit`, `refund`,
  `entitlement`, `allowance` across `agent/`, `audits/`, `site-health/`,
  `integrations/`, `analytics/`.
- `frontend/services/api/src/config/billing.ts`, `config/billing.json`,
  `config/costs.json`.

## Hunt list

1. **Access granted by the wrong signal.** Entitlement or subscription
   activated by a redirect, checkout callback, client-reported success or
   provider dashboard state instead of the shared idempotent activation owner
   reached from verified webhook or reconciliation.
2. **Double settlement.** Webhook and reconciliation both applying the same
   payment; replayed webhook creating a second grant or ledger row; missing
   unique key on provider payment/refund IDs.
3. **Reservation leaks.** Paths where a credit reservation is taken but never
   released or settled on failure, timeout, cancellation or worker crash;
   release after debit; debit without reservation.
4. **Money arithmetic.** Floats for currency, rounding at the wrong step,
   tax computed on the wrong base, currency mixed (INR vs USD), negative or
   zero amounts accepted, integer overflow in minor units.
5. **Catalog authority.** Prices or plan terms read from anywhere other than
   the published persisted catalog; existing subscriptions re-priced when the
   catalog changes (must not be retroactive).
6. **Flag coupling.** Checkout, no-card campaign and card trial must be
   independent switches; enabling one must not imply another; defaults are
   disabled.
7. **BYOK.** Customer-key model calls consuming platform credits, or silently
   falling back to the platform key when the customer key fails.
8. **Platform-funded work without a cap.** Model work charged to the platform
   with no persisted finite rate/cap policy (the only exception is the
   development login's `development` Agent funding, which still records attempts).
9. **Mutable history.** Updates or deletes on grants, revocations, ledger,
   receipts, attempts or claims instead of append-only correction rows.
10. **Lock order.** After taking the account-capacity lock or any billing row,
    a transaction later locks project, prompt, runtime, audit or task rows.

## Not a finding

- Checkout or card trial being disabled — intended until activation.
- The temporary Python bootstrap/seed grant bridge alongside native billing —
  documented split.

## Subagent split

- A: webhooks, settlement, reconciliation, recovery (1, 2, 9).
- B: reservations and metering call sites across workers (3, 7, 8).
- C: amounts, tax, catalog, flags (4, 5, 6) and lock order (10).

## Output

Use the report format in `_contract.md`. Each failure scenario names the
customer-visible outcome ("charged twice", "access without payment",
"credits lost").
