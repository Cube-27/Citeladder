# Razorpay local testing runbook

Run these commands in **PowerShell 7 from the repository root**. This guide uses
only the isolated `citeladder-billing-test` Compose project and the ignored
`billing-test.env`. It does not deploy to GCP. The owner will perform real sandbox
acceptance; mocked checks are not payment evidence.

On 2026-09-08 the owner confirmed local INR approval and reported international
approval still pending. Keep international and live readiness false. Each
recurring method and the separate GST treatment still need verification below.
Funded checkout remains disabled under the approved BYOK-only scope.

## 1. Start the isolated environment

Install Docker with Compose support for `!override`, PowerShell 7, `uv`, and
`cloudflared`. If the backend virtual environment is missing:

```powershell
Push-Location backend
uv sync --frozen --extra dev
Pop-Location
```

The ignored `billing-test.env` has already been prepared for this workspace.
On another machine create a private copy of `.env.example`, supply local database
and application secrets, and set the following explicitly:

```dotenv
POSTGRES_DB=citeladder_billing_test
DEMO_MODE=false
DEV_LOGIN_PASSWORD=
BILLING_RAZORPAY_MODE=test
BILLING_CHECKOUT_ENABLED=false
BILLING_RAZORPAY_TEST_READY=false
BILLING_RAZORPAY_TEST_INDIA_READY=false
BILLING_RAZORPAY_TEST_INTERNATIONAL_READY=false
BILLING_RAZORPAY_LIVE_READY=false
BILLING_RAZORPAY_INTERNATIONAL_READY=false
BILLING_SUBSCRIPTION_TOTAL_CYCLES=3
```

Use `BILLING_RAZORPAY_KEY_ID` and `BILLING_RAZORPAY_KEY_SECRET` for the test
credentials. Configure an independent `BILLING_QUOTE_SIGNING_SECRET` and a
separate `BILLING_RAZORPAY_WEBHOOK_SECRET`. Quote secret values in dotenv files.
Leave platform provider keys and credential references empty. Generic
`RAZORPAY_KEY_*` names are not application settings. Do not print the environment
or expanded Compose configuration.

```powershell
.\scripts\billing-test.ps1 -Action up
.\scripts\billing-test.ps1 -Action status
```

Expected: frontend `http://127.0.0.1:3300`, API port 8300, PostgreSQL port 55433,
webhook proxy port 8301. Migration exits successfully; web/frontend/database and
the recovery worker remain running. The ordinary local stack uses other ports
and must remain untouched.

Sign in as the ordinary payment customer `dev@citeladder.com`. Its generated
local password was stored privately in `.runtime/billing-test-customer.json`.
If that scratch file was removed, use your saved credentials or a fresh ordinary
customer; do not assume the password is recoverable from the database. If using
a new database, register normally at `/register`. Confirm free access
and no paid/development grants before paying. The existing local customer has
role `user` and three free-baseline grants. Baseline grants may have source kind
`override`; inspect their profile and values, not just that field.

## 2. Create a separate local catalog operator

Register `billing-operator@example.com` through the local UI with your own
password. The admin CLI requires an existing active admin and cannot bootstrap
one. The following explicit first-admin procedure applies only to this disposable
local database. Do not promote the payment customer or a deployed account.

Inspect the exact identity (use your configured database user if not `postgres`):

```powershell
docker exec citeladder-billing-test-db-1 psql -U postgres -d citeladder_billing_test -v ON_ERROR_STOP=1 -c "SELECT id,email,role,is_active FROM users WHERE email='billing-operator@example.com';"
```

Proceed only if exactly one row is returned for your newly registered operator:

```powershell
docker exec citeladder-billing-test-db-1 psql -U postgres -d citeladder_billing_test -v ON_ERROR_STOP=1 -c "UPDATE users SET role='admin' WHERE email='billing-operator@example.com' AND is_active=true RETURNING id,email,role;"
```

Require one returned row. Record its UUID and this local administrative action.
Admin identity does not replace payment entitlement verification.

## 3. Prepare and import an INR-only draft

The committed fixture contains INR and USD proposals. Since international is
pending, create a private INR-only copy. Its remaining references will all be
verified; do not weaken verification to skip missing plans.

```powershell
New-Item -ItemType Directory -Force .runtime | Out-Null
$catalog = Get-Content docs/operations/razorpay-sandbox-catalog.json -Raw | ConvertFrom-Json -AsHashtable
foreach ($plan in $catalog.plans) { $plan.regional_byok_prices.Remove('international') | Out-Null }
$catalogFile = Join-Path (Resolve-Path .runtime).Path 'razorpay-inr-catalog.json'
$catalog | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $catalogFile -Encoding utf8NoBOM
$revision = 'sandbox-inr-2026-09-08-r1'
$actor = 'billing-operator@example.com'
.\scripts\billing-test.ps1 -Action admin -CommandArgs @('catalog-validate','--file',$catalogFile)
$importArgs = @('catalog-import','--revision',$revision,'--file',$catalogFile,'--actor',$actor,'--reason','Prepare local INR sandbox','--idempotency-key',"import-$revision")
.\scripts\billing-test.ps1 -Action admin -CommandArgs $importArgs
```

Review the dry-run, then apply it:

```powershell
.\scripts\billing-test.ps1 -Action admin -CommandArgs ($importArgs + '--apply')
.\scripts\billing-test.ps1 -Action plans -CommandArgs @('propose','--revision',$revision,'--environment','test')
```

There is no `--dry-run` option: omitting `--apply` is the dry-run. The launcher
loads only the selected billing environment, disables ordinary dotenv loading
for host CLI commands, and targets port 55433. Catalog paths must be absolute.
Proposal makes no provider calls and does not create plans.

## 4. Create and verify actual Razorpay test plans

Select **Test mode** in the Razorpay Dashboard. Confirm Subscriptions and the
INR recurring methods you intend to exercise. Create three monthly plans with
interval 1, using the exact names and terms printed by `propose`.

| Tier | Base, paise | Separate GST, paise | Total, paise |
|---|---:|---:|---:|
| Tier 1 | 416500 | 74970 | 491470 |
| Tier 2 | 841500 | 151470 | 992970 |
| Tier 3 | 1266500 | 227970 | 1494470 |

The fixture freezes synthetic FX 85.00 and tax rate 0.18, rounding the base then
tax with decimal HALF_UP. Gateway approval does not establish invoice tax parity.
The verifier requires provider plan `item.amount` to equal the base,
`item.tax_amount` to equal the separate GST, and `item.tax_inclusive` to be false.
If Razorpay cannot represent these terms, stop here, record the provider
limitation, and keep India readiness false. Do not mark tax verified or replace
the total with a base-only charge to make checkout work.

Edit the private catalog's `regional_byok_prices.india.provider_price_ref` values
with the three actual `plan_...` IDs. Set each `tax_verified` true only after
checking the actual provider fields. Keep all other frozen terms unchanged.
Import a **new** immutable revision by setting `$revision` to
`sandbox-inr-2026-09-08-r2`, reconstructing `$importArgs` as above, reviewing its
dry-run, then applying it. Never overwrite a persisted revision.

```powershell
.\scripts\billing-test.ps1 -Action plans -CommandArgs @('verify','--revision',$revision,'--environment','test')
$publishArgs = @('catalog-publish','--revision',$revision,'--actor',$actor,'--reason','Verified INR sandbox plans','--idempotency-key',"publish-$revision")
.\scripts\billing-test.ps1 -Action admin -CommandArgs $publishArgs
```

Require one successful verification for each of the three INR plans before
publishing. Review the publication dry-run, then:

```powershell
.\scripts\billing-test.ps1 -Action admin -CommandArgs ($publishArgs + '--apply')
```

## 5. Configure the test webhook

In another PowerShell terminal, keep this command running:

```powershell
.\scripts\billing-test.ps1 -Action tunnel
```

Configure the Razorpay **Test** webhook with the printed HTTPS hostname plus
`/api/v1/billing/webhooks/razorpay`. Use the same webhook secret as the private
billing environment and a monitored alert address. Update the Dashboard after
every tunnel restart. If the provider rejects the tunnel domain, use an approved
HTTPS ingress forwarding to the same narrow local proxy; do not expose the
entire API. Razorpay documents public URL requirements and blocked tunnel
services in its [webhook testing guide](https://razorpay.com/docs/webhooks/validate-test/?locale=en-US).

Select only these implemented events:

- `subscription.authenticated`, `subscription.activated`, `subscription.charged`
- `subscription.pending`, `subscription.halted`, `subscription.cancelled`
- `subscription.completed`, `subscription.expired`
- `subscription.paused`, `subscription.resumed`
- `payment.captured`, `payment.failed`

Confirm an unrelated proxy path returns 404, a non-POST webhook request returns
403, a missing signature returns 422, and an invalid signature returns 400.
An accepted signed event returns 204 promptly (target under five seconds);
processing happens afterward. Redelivery of the same event must not duplicate
receipts or grants. Test and live webhook configurations are separate.
[Webhook overview](https://razorpay.com/docs/webhooks/)

## 6. Enable INR checkout and make the first payment

Only after the preceding merchant, catalog, tax and webhook checks, change these
values in `billing-test.env`:

```dotenv
BILLING_CHECKOUT_ENABLED=true
BILLING_RAZORPAY_TEST_READY=true
BILLING_RAZORPAY_TEST_INDIA_READY=true
```

Keep test international, live and live international readiness false. Restart
with `-Action up` to propagate configuration to all processes. Use `/pricing`,
select BYOK and India, and pay as the ordinary customer. Confirm the exact tier,
INR amount, test-mode indicator and customer email in Checkout. This integration
uses a subscription ID, not an Orders checkout for recurring tiers.

Use only [Razorpay's documented test payment details](https://razorpay.com/docs/payments/payments/test-card-details/).
On callback, the app may display pending while checking persisted provider
proof. Access requires a captured invoice/payment with the exact account,
subscription, plan, mode, frozen amount/tax and billing period. A callback alone
must never grant access. Polling stops after 60 seconds and offers manual refresh.

Inspect the activation response in browser Network and the account with:

```powershell
$accountId = 'REPLACE_WITH_BILLING_ACCOUNT_UUID'
.\scripts\billing-test.ps1 -Action admin -CommandArgs @('account-inspect','--account-id',$accountId,'--actor',$actor,'--reason','Inspect sandbox payment','--idempotency-key','inspect-inr-1')
docker logs --tail 30 citeladder-billing-test-billing-reconciler-1
```

Get the billing account UUID from the signed-in billing API response, not a
workspace or user ID. Inspect exact amounts and periods alongside the provider
invoice. A successful initial purchase produces one receipt and one paid grant
bundle. Use a separate ordinary customer for each tier, or cancel and wait for
the verified paid period to end before buying another base subscription.

## 7. Acceptance scenarios

Record each row as passed, failed, merchant-disabled, or not simulatable in
sandbox. Until attempted it is **unverified**. Repeat applicable payment flows
for all tiers and each merchant-enabled INR method.

| Action | Expected evidence |
|---|---|
| Dismiss the modal, then retry | No paid access; retry reuses the activation/idempotency identity. |
| Block `checkout.razorpay.com/v1/checkout.js` in browser request blocking | Bounded script timeout/error, retry available, no paid access. |
| Trigger `payment.failed`, retry in the modal | Visible error; a later valid success can still reconcile. |
| Modify a callback signature or omit a required field | Rejection, no paid access; another account's activation is inaccessible. |
| Authorize without capture | Pending/authenticated state, no captured receipt or paid bundle. |
| Complete initial capture | Exact invoice/total/period and one receipt-backed grant bundle. |
| Redeliver or reorder webhook events | No duplicate receipt/grants and no stale state resurrection. |
| Charge a renewal through test controls | A distinct verified period and receipt; reused or overlapping periods grant nothing. |
| Fail renewal; recover from pending/halted | No unpaid-period grants; verified recovery restores only paid time. |
| Cancel, complete or expire subscription | Verified paid time remains usable; terminal expiry releases the base slot. |
| Stop tunnel during capture, run reconciliation, then restore tunnel | Same final receipt/grants; delayed webhook creates no duplicate. |
| Set checkout enabled false and restart | New checkout blocked; existing recovery continues. |
| Reopen existing project evidence after expiry | Historical evidence remains readable under workspace authorization. |
| Sign in as an invited workspace member | Only the correct workspace sponsor's access applies. |
| Select international while approval is pending | Purchase unavailable; no USD subscription created. |

Razorpay provides test subsequent-charge controls such as **Charge this now**.
Schedule card renewal checks within its documented three-day test token window;
record unsupported lifecycle simulations explicitly.
[Subscription testing](https://razorpay.com/docs/payments/subscriptions/test/?preferred-country=IN)

The recovery worker is installed by `infra/compose.billing-test.yml`. The ordinary
Compose/GCP stack does not enable this sandbox worker or authorize checkout;
any future billing deployment must explicitly install and monitor reconciliation
before accepting asynchronous webhooks. Keep `BILLING_RAZORPAY_MODE=test` while
using the checkout kill switch; `disabled` intentionally prohibits provider I/O.
Legacy catalogs without explicit provider mode remain display-only until replaced
by a verified regional revision.

Subscription discovery reads bounded provider pages and reports an incomplete
search as an error, never as proof that no subscription exists. Invoice retrieval
uses the provider's complete subscription-invoice endpoint without an artificial
count limit. See [subscription pagination](https://razorpay.com/docs/api/payments/subscriptions/fetch-subscriptions/?preferred-country=IN)
and [subscription invoices](https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/?preferred-country=IN).

For a one-shot recovery pass (the Compose worker also runs bounded sweeps):

```powershell
.\scripts\billing-test.ps1 -Action reconcile
```

## 8. Troubleshooting and secret rotation

| Symptom | Check / next action |
|---|---|
| `active_admin_required` | Separate operator exists, is active and has admin role in the isolated database. |
| Empty or unavailable pricing | Import and publish the reviewed catalog; reads never seed it. |
| Missing plan or verification mismatch | Match all referenced provider plans to the exact revision; import a new revision for corrections. |
| Provider authentication failure | Test key pair and explicit test mode agree; do not paste secrets into logs or tickets. |
| GST verification failure | Record actual provider support and keep INR checkout disabled pending resolution. |
| Callback remains pending | Inspect provider capture/invoice and recovery logs; authorization is insufficient. |
| Webhook deliveries fail | Current HTTPS hostname, exact POST path, matching independent secret, proxy and API health. |
| Bounded recovery retries exhausted | Inspect persisted failure and provider evidence before retrying; do not repeatedly create subscriptions. |

For planned webhook secret rotation, configure the previous secret plus
`BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET_STARTED_AT` and
`BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET_EXPIRES_AT` as timezone-aware ISO-8601
values, for example `2026-09-08T10:00:00Z` and `2026-09-09T10:00:00Z`. The overlap
may not exceed 24 hours. Coordinate the Dashboard change and restart services.
Clear previous fields afterward; blank optional timestamps are accepted. On
compromise remove old-secret acceptance immediately and reconcile deliveries.
The quote-signing secret is independent from provider and webhook secrets.

## 9. Record results and shut down

For each scenario record: date, application commit, isolated project/database,
operator, provider mode, catalog revision/digest, tier/method, expected and actual
amount/tax, activation/subscription/payment/invoice IDs, resulting receipt and
grant periods, outcome and limitation. Record the webhook allow-list and verified
alert recipient. Exclude credentials, signatures, card details and raw payloads.

Initial wiring evidence from 2026-09-08: disposable migration and ORM drift check
passed; local registration/login/readiness worked; proxy rejection checks worked;
the recovery worker completed sweeps. Read-only test plan inventory returned 200
and zero plans. No provider plans or payments were created by the agent. The
stack was then stopped with its isolated volume preserved. These results do not
establish real payment acceptance or validate later changes automatically.

Cancel actual test subscriptions in Razorpay, disable its test webhook, stop the
tunnel with Ctrl+C, set local checkout enabled false, then:

```powershell
.\scripts\billing-test.ps1 -Action down
```

This preserves local evidence. For an optional clean restart, first inspect
`docker volume ls --filter label=com.docker.compose.project=citeladder-billing-test`
and remove only the explicitly reviewed disposable volume after saving evidence.
The launcher deliberately has no destructive reset. Never reset the ordinary
local or GCP database as part of this runbook.

For enterprise operations and audited grant corrections, see the
[billing operator guide](billing-operator-guide.md). Live enablement and
international acceptance are separate outstanding owner decisions.
