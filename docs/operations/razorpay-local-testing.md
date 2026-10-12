# Razorpay local testing runbook

Manual sandbox acceptance on an isolated local stack. It uses only the
`citeladder-billing-test` Compose project, the ignored `billing-test.env` and its
own database; it never deploys to GCP and never touches the ordinary local stack.
Mocked checks are not payment evidence. The acceptance list to satisfy is
[owner requirements, section 8](razorpay-and-demo-owner-requirements.md#8-required-sandbox-acceptance-evidence);
commands and incident procedures are in the
[billing operator guide](billing-operator-guide.md), and behavior is in
[billing and entitlements](../billing-entitlements.md). Run the PowerShell
commands in PowerShell 7 from the repository root.

## 1. Start the isolated environment

Install Docker with Compose support for `!override`, PowerShell 7 and
`cloudflared`. Create a private `billing-test.env` from `.env.example` with local
database and application secrets, and set these explicitly (the launcher refuses
other values):

```dotenv
POSTGRES_DB=citeladder_billing_test
DEMO_MODE=false
DEV_LOGIN_PASSWORD=
BILLING_RAZORPAY_MODE=test
BILLING_RAZORPAY_KEY_ID=rzp_test_...
BILLING_CHECKOUT_ENABLED=false
BILLING_CHECKOUT_AUDIENCE=everyone
BILLING_RAZORPAY_TEST_READY=false
BILLING_RAZORPAY_TEST_INDIA_READY=false
BILLING_RAZORPAY_TEST_INTERNATIONAL_READY=false
BILLING_RAZORPAY_LIVE_READY=false
BILLING_RAZORPAY_INTERNATIONAL_READY=false
BILLING_SUBSCRIPTION_TOTAL_CYCLES=12
BILLING_INDIA_GST_RATE=0.18              # sandbox only (B56)
BILLING_INDIA_GST_APPROVAL_REFERENCE=sandbox
BILLING_SELLER_SAC=<approved service accounting code>
BILLING_SELLER_LUT_REFERENCE=<current LUT reference>
```

`BILLING_RAZORPAY_KEY_SECRET`, a separate `BILLING_RAZORPAY_WEBHOOK_SECRET` and an
independent `BILLING_QUOTE_SIGNING_SECRET` are also required. Leave platform
provider keys (`PROVIDER_PLATFORM_*`) and `BILLING_RAZORPAY_LIVE_READY` empty or
false; the launcher fails otherwise. Seller identity defaults to the recorded
values ([B45](../billing-decisions.md)); without the GST rate and approval
reference India prices are not authored, and without SAC or LUT quotes are
refused. Because this stack is not production, `BILLING_CHECKOUT_AUDIENCE=everyone`
serves any workspace in test mode; in production the allow-list applies
([B2, B42](../billing-decisions.md)). Do not print the environment or expanded
Compose configuration.

```powershell
.\scripts\billing-test.ps1 -Action up
.\scripts\billing-test.ps1 -Action status
```

Expected: frontend `http://127.0.0.1:3300`, API port 8300, PostgreSQL port 55433,
webhook proxy port 8301; migration exits successfully and the api-service,
frontend, database and `runner` services stay running. Register the payment
customer normally at `/register`; this is a managed-key-free stack, so test BYOK
plans only.

## 2. Create a local catalog operator

The admin CLI needs an existing active admin and cannot create one. Register
`billing-operator@example.com` through the UI, then promote it in this
disposable database only (never the payment customer or a deployed account):

```powershell
docker exec citeladder-billing-test-db-1 psql -U postgres -d citeladder_billing_test -v ON_ERROR_STOP=1 -c "SELECT id,email,role,is_active FROM users WHERE email='billing-operator@example.com';"
```

Proceed only if exactly one row returns, then:

```powershell
docker exec citeladder-billing-test-db-1 psql -U postgres -d citeladder_billing_test -v ON_ERROR_STOP=1 -c "UPDATE users SET role='admin' WHERE email='billing-operator@example.com' AND is_active=true RETURNING id,email,role;"
```

Require one returned row and record the UUID and this local action.

## 3. Author the catalog, create plans, bind and publish

The launcher runs `billing-admin.ts` (`-Action admin`) and
`provision-razorpay-plans.ts` (`-Action plans`) against the isolated database.
Both are dry runs until `--apply`; there is no `--dry-run` flag. Files must live
inside the repository (use `.runtime/`).

```powershell
$actor = 'billing-operator@example.com'
.\scripts\billing-test.ps1 -Action admin -CommandArgs @('catalog-seed','--environment','test','--usd-inr-rate','90','--actor',$actor,'--reason','Author sandbox launch pricing','--idempotency-key','catalog-seed:launch-pricing-v1')
```

Review the dry run, repeat with `'--apply'`, then print the plan specs:

```powershell
.\scripts\billing-test.ps1 -Action plans -CommandArgs @('propose','--revision','launch-pricing-v1','--environment','test')
```

In the Razorpay Dashboard (**Test mode**, Subscriptions enabled), create exactly
the printed plans: one per recurring plan, mode and region, with the printed names
and gross amounts. Write the created IDs to `.runtime/plans.json` keyed
`plan:mode:region`, for example `{"tier_1:byok:international": "plan_..."}`; the
operator guide shows the shape. Bind them into a new draft revision, review, then
publish:

```powershell
$bind = @('bind','--revision','launch-pricing-v1','--environment','test','--plans','.runtime/plans.json','--import','sandbox-r1','--actor',$actor,'--reason','Bind sandbox plans','--idempotency-key','catalog-bind:sandbox-r1')
.\scripts\billing-test.ps1 -Action plans -CommandArgs $bind
.\scripts\billing-test.ps1 -Action plans -CommandArgs ($bind + @('--publish','--apply'))
```

`bind` fetches every plan from Razorpay and fails closed on any missing plan or
mismatch in name, gross amount, currency or cadence; correct by creating a new
plan and importing a new revision, never by editing a persisted one. Razorpay's
own tax fields are not authority: CiteLadder freezes the taxable value and the
CGST/SGST or IGST split before provider I/O and issues the receipt after a
captured payment matches the final total.

## 4. Configure the test webhook

In another terminal, keep this running:

```powershell
.\scripts\billing-test.ps1 -Action tunnel
```

Configure the Razorpay **Test** webhook with the printed HTTPS hostname plus
`/api/v1/billing/webhooks/razorpay`, the same secret as `billing-test.env` and a
monitored alert address; update it after every tunnel restart. If Razorpay rejects
the tunnel domain, use an approved HTTPS ingress to the same narrow proxy
(`infra/billing-webhook.nginx.conf`, port 8301); never expose the entire API.
See Razorpay's [webhook testing guide](https://razorpay.com/docs/webhooks/validate-test/?locale=en-US).

Select exactly the events in
[owner requirements, section 5](razorpay-and-demo-owner-requirements.md#5-production-urls-and-webhook-setup).

Expected responses: an unrelated proxy path returns 404 and a non-POST request
403 (both from the proxy); a missing or invalid signature returns 400 (as does any
malformed payload); an accepted signed event returns 204 promptly and is
processed afterward. Redelivering the same event must not duplicate receipts or
grants.

## 5. Enable checkout and make the first payment

After the catalog and webhook checks, set in `billing-test.env`:

```dotenv
BILLING_CHECKOUT_ENABLED=true
BILLING_RAZORPAY_TEST_READY=true
BILLING_RAZORPAY_TEST_INDIA_READY=true
```

Keep the USD route (`BILLING_RAZORPAY_TEST_INTERNATIONAL_READY`) and live flags
false until the USD plans are bound and verified. Run `-Action up` again to
propagate configuration, then use `/pricing` or in-app Billing, select India, and
pay as the ordinary customer. Confirm tier, INR amount, test-mode indicator and
email in Checkout. Use only
[Razorpay's test payment details](https://razorpay.com/docs/payments/payments/test-card-details/).

Access requires a captured payment bound to the exact subscription, plan, mode,
frozen amount and period; a callback alone never grants it. Inspect the account
(the billing account UUID comes from the signed-in billing API response, not a
workspace or user ID):

```powershell
.\scripts\billing-test.ps1 -Action admin -CommandArgs @('account-inspect','--workspace-id','<workspace-uuid>','--account-id','<billing-account-uuid>','--actor',$actor,'--reason','Inspect sandbox payment','--idempotency-key','inspect-inr-1')
docker logs --tail 30 citeladder-billing-test-runner-1
```

A successful initial purchase produces one receipt and one paid grant bundle. Use
a separate customer per tier, or change plans through the app.

## 6. Acceptance scenarios

Record each as passed, failed, merchant-disabled or not simulatable in sandbox;
until attempted it is **unverified**. The full evidence list is in
[owner requirements, section 8](razorpay-and-demo-owner-requirements.md#8-required-sandbox-acceptance-evidence).
Repeat applicable flows for every tier and each enabled INR method.

| Action                                                           | Expected evidence                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Dismiss the Checkout modal, then retry                           | No paid access; retry reuses the activation identity.                          |
| Block `checkout.razorpay.com/v1/checkout.js` in the browser      | Bounded script error, retry available, no paid access.                         |
| Decline a payment on an order, then pay on the same order        | A declined attempt never fails the order; the paid retry settles ([B25]).      |
| Tamper with a callback signature or omit a field                 | Rejection, no paid access.                                                     |
| Authorize without capture                                        | Pending state, no receipt or paid bundle.                                      |
| Redeliver or reorder webhook events                              | No duplicate receipt or grants; no stale state resurrection.                   |
| Charge a renewal with Razorpay's **Charge this now**             | A distinct period and receipt.                                                 |
| Fail renewals until the subscription is halted                   | Sweep cancels it at Razorpay ([B24]); no unpaid-period grants.                 |
| Schedule a cancellation, resume it, schedule again               | Held in CiteLadder, sent only before renewal ([B46]); resume clears it.        |
| Upgrade, then downgrade                                          | Prorated order settles and switches the plan; downgrade waits for renewal.     |
| Buy an add-on and a top-up                                       | Grants inside the current period; one paid outside it is flagged for refund.   |
| Fully refund the current period's payment in the Dashboard       | Credit note, grants revoked, subscription cancelled at once ([B52]).           |
| Stop the tunnel during a capture, run reconciliation, restore it | Same final receipt and grants; the delayed webhook creates no duplicate.       |
| Set checkout enabled false and restart                           | New checkout blocked; webhooks, recovery and downgrade continue ([B28]).       |
| Select international before USD plans and flags are verified     | Purchase unavailable; no USD subscription created.                             |

[B24]: ../billing-decisions.md
[B25]: ../billing-decisions.md
[B28]: ../billing-decisions.md
[B46]: ../billing-decisions.md
[B52]: ../billing-decisions.md

Razorpay's test controls (**Charge this now**) work within its documented
three-day test token window; record unsupported lifecycle simulations explicitly
([subscription testing](https://razorpay.com/docs/payments/subscriptions/test/?preferred-country=IN)).

For a one-shot recovery pass (the `runner` service also runs bounded sweeps):

```powershell
.\scripts\billing-test.ps1 -Action reconcile
```

Keep `BILLING_RAZORPAY_MODE=test` while using the kill switch; `disabled`
prohibits provider I/O.

## 7. Troubleshooting and cleanup

| Symptom                               | Check / next action                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `active_admin_required`               | The operator exists, is active and has the admin role in the isolated database.    |
| Empty or unavailable pricing          | Seed, bind and publish the catalog; reads never seed it.                           |
| Missing plan or verification mismatch | Match every plan to the revision; import a new revision for corrections.           |
| Provider authentication failure       | Key pair and `BILLING_RAZORPAY_MODE=test` agree; never paste secrets into logs.    |
| Checkout unavailable                  | Kill switch, audience, readiness flags for mode and region, quote secret distinct. |
| Callback remains pending              | Inspect provider capture and runner logs; authorization is insufficient.           |
| Webhook deliveries fail               | Current tunnel hostname, exact POST path, matching secret, proxy and API health.   |
| Recovery retries exhausted            | Inspect persisted failure and provider evidence; do not create more subscriptions. |

Webhook-secret rotation follows the
[operator guide](billing-operator-guide.md#webhook-secret-rotation).

Record per scenario: date, commit, provider mode, catalog revision, tier and
method, expected and actual amount and tax, activation, subscription, payment and
invoice IDs, resulting receipt and grant periods, and outcome. Exclude
credentials, signatures, card details and raw payloads.

To finish, cancel the test subscriptions in Razorpay, disable its test webhook,
stop the tunnel with Ctrl+C, set `BILLING_CHECKOUT_ENABLED=false`, then:

```powershell
.\scripts\billing-test.ps1 -Action down
```

This preserves the local volume. The launcher has no destructive reset; remove a
disposable volume only after saving evidence and inspecting
`docker volume ls --filter label=com.docker.compose.project=citeladder-billing-test`.
Never reset the ordinary local or GCP database as part of this runbook.
