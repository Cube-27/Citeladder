> Historical original preserved before remaining-scope consolidation. This
> record does not authorize execution; current work is in
> [the plan index](../../plans/ACTIVE.md).

# Razorpay local test integration, onboarding fix, and owner runbooks

> **Status:** active local/sandbox delivery plan. The prerequisite recovery
> section below is historical and must not be rerun; current work begins with
> the isolated local test integration sections. No live reset, deployment,
> checkout, or provider mutation is authorized by this plan.

## Prerequisite recovery - 2026-09-08

The owner authorized separate login/deployment recovery before Razorpay work:
section 2A occupancy and routing fixes, deployment schema preflight, and explicit
rebuild of the live disposable database. Live inspection found one account,
zero projects, and zero subscriptions; failed bootstrap was missing
`billing_accounts.registration_cohort_at`. The installed image baseline hash
matched the repository baseline. The owner approved replacing the dev account
UUID/sessions and reprovisioning its existing configured credentials; backup
preservation is not required. Pricing visibility and initial catalog provisioning are included in recovery.
Payment integration and checkout enabling are not
part of this recovery. Sections 2B onward remain a separate implementation.

The historical recovery used `python infra/gcp/reset-db.py --project <PROJECT_ID>`
to preview the installed GCP target; its `--reset-project <PROJECT_ID>` option
explicitly destroyed/rebuilt its
`citeladder` database, apply the installed baseline, reprovision the configured
dev login, check schema drift, and restart the application. Optional `--instance`
and `--zone` select the VM. This uses installed images and does not deploy new
code, save backups, or change configured credentials. Run the normal deploy
workflow to install a newer revision afterward. Record rollout and integrated
login verification results here after recovery completes.

Local configuration used `GOOGLE_OAUTH_CLIENT_*` names. The configuration owner
now accepts these aliases for the shared Google client; canonical
`INTEGRATION_GOOGLE_CLIENT_ID` / `_SECRET` take precedence. Local Compose now
runs explicit dev bootstrap after migrations when credentials are configured,
and both deployment bootstrap and the local reset provisioning command publish
the approved initial catalog if none exists. This fixes an empty recreated
database containing neither the dev login nor visible pricing; ordinary
registration/login and pricing reads do not publish catalog state.
Literal dollar signs in local connection settings are single-quoted to prevent
Compose interpolation. `.env.example` uses the canonical configuration names.

Validation: the full `scripts/check.ps1` passed. The initial `scripts/test.ps1`
passed 267 backend tests and found one stale frontend redirect expectation;
the required retry-delta run passed 164 frontend tests and all 10 mapped browser
tests. Local backend and frontend production images built successfully. The owner then
reported missing local login/pricing after recreating the database; the follow-up
bootstrap and Google-alias regression tests are included for CI validation,
without repeating the completed local suites.

Live rebuild completed successfully with the installed image, including baseline
migration, configured dev account, a clean `alembic check`, and application health.
The follow-up deployment installs occupancy/routing fixes and initializes pricing.

Follow-up UI recovery fixes keep the pricing CTA inside its card, interpret
numeric effective flag grants (`1`) correctly so the dev account sees Content
and Growth Agent, and suppress duplicate scrollbar compensation in shared document styles for
menus, selects, date pickers, and dialogs. Their focus and scroll locks remain intact. Cached projects remain usable after a failed
background refresh. Commerce prompt inserts now enforce account prompt capacity
in the insert transaction, after all generation calls finish. The GCP reset
attempts one forward recovery on failure, checks schema validity before starting
services, and preserves a failing exit status for operator visibility. This is
not data rollback: the owner explicitly authorized a destructive reset without
backup preservation. No further local test suites are run at the owner's request;
CI remains the merge gate.

## 1. Execution boundary and agreed scope

The owner explicitly requested implementation on 2026-09-08. The earlier save-only handoff is superseded. External sandbox acceptance remains evidence-gated.

The following specification governs the implementation authorized in this session.

Deliver:

- A fix for the dev account’s post-login “Project access unavailable” screen.
- An isolated **local staging** stack with an HTTPS webhook tunnel; no GCP staging deployment.
- Razorpay **Standard Checkout modal for recurring subscriptions**.
- Tier 1–3 subscription testing in INR and USD, covering every applicable merchant-enabled method.
- An ordinary payment-test account using `dev@citeladder.com`, without development grants masking payment results.
- Accurate provisioning, verification, recovery, and owner runbooks.

Keep Enterprise contact-only. Keep card trials, no-card campaigns, add-ons, top-ups, and live checkout disabled. Preserve funded pricing metadata, but do not enable funded checkout: its current provider call charges only the base plan and does not match the funded quote.

Account creation, gateway approval, and saved test keys are owner-reported facts. Subscriptions enablement, recurring methods, international recurring support, webhook configuration, and actual test transactions remain unverified.

The Standard Checkout integration must use **subscription IDs**, following Razorpay’s subscription-specific guide. Do not introduce an Orders payment flow for recurring tiers. [Razorpay subscription integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/?preferred-country=IN)

## 2. Prerequisite fixes and local environment

### A. Fix the post-login onboarding failure

**Confirmed code mismatch:** the onboarding gate requires numeric `project_slots.remaining`, while `account_usage()` currently returns unknown/null usage for every non-consumable counter. Project slots are occupancy counters, so successful API responses can still produce the reported error screen.

Implement under the existing billing-read and entitlement-enforcement owners:

- Extract a shared, read-only occupancy-counting seam from the current project/prompt counting logic in `backend/app/domain/entitlements/enforcement.py`.
- Use the same account-linked workspace scope and counting rules for admission and usage projections.
- For resolved project/prompt occupancy allowances, return:
  - `allowance`: effective resolved capability value.
  - `consumed`: persisted occupancy count.
  - `reserved`: zero, because these paths do not use consumable reservations.
  - `remaining`: `max(allowance - consumed, 0)`.
  - `limit_state`: finite.
- Preserve unknown/unresolved states when authority is missing. Do not fabricate limits for other counter families.
- Keep usage reads side-effect-free. Creation still performs its existing locked capacity check; the displayed count is advisory.

Fix frontend routing and recovery:

- Login routes to onboarding only after a **successful empty project response**.
- A failed project lookup routes to a recoverable projects state instead of assuming the account has no projects.
- The application onboarding gate must consider query errors before interpreting an empty list.
- The onboarding page distinguishes project-loading failure, usage-loading failure, unresolved access, and a genuine exhausted allowance.
- Add a Retry action that refetches the relevant queries without forcing logout or bouncing between `/projects` and `/onboarding`.
- Preserve safe pricing/MCP return destinations and account-transition cache clearing.

Validate the reported scenario with the integrated API response. Do not claim the deployed incident is confirmed fixed until its deployed revision and response behavior have been checked during the later rollout.

### B. Separate development privileges from payment testing

The billing bootstrap currently selects broad development grants using an email comparison. Deployment bootstrap can also promote the configured development email to administrator.

- Remove privileged grant assignment from ordinary registration/login based solely on email.
- Issue development access only through the explicit development bootstrap, bound to the persisted user UUID, with audited/idempotent grants.
- Keep intentional operator access separate from customer subscription entitlements.
- In local billing staging, disable development/demo bootstrap and platform-credential escape hatches.
- Create `dev@citeladder.com` as an ordinary account through the normal authentication flow.
- Verify that it has only baseline access before checkout, with no development, override, campaign, or trial grants.
- Use a separate trusted operator identity for catalog administration.
- Do not reset or demote the existing deployed dev account as part of local setup. Existing grant corrections require exact-target, append-only revocation.

### C. Configure isolated local staging

Reuse the existing Compose stack. Add a local billing-staging override and a PowerShell launcher under existing script/infrastructure ownership.

Defaults:

- Compose project: `citeladder-billing-test`.
- Separate PostgreSQL volume and database.
- Loopback ports: frontend `3300`, backend `8300`, database `55433`, webhook proxy `8301`.
- Dedicated ignored environment file; do not overwrite the current `.env`.
- Parameterize the existing backend `env_file` selection so every local-staging backend process receives the selected file.
- Neutralize inherited database environment overrides inside the launcher’s process scope.
- Run the existing baseline migration against this disposable database only.
- Keep automated tests on a different database through `TEST_DATABASE_URL`.

Docker and `cloudflared` are installed. Use a Cloudflare Quick Tunnel pointing to a narrow local reverse proxy. The proxy permits only `POST /api/v1/billing/webhooks/razorpay`; all other paths/methods are rejected. Do not expose the general API, documentation, login, database, or frontend through this tunnel.

Quick Tunnels provide a temporary HTTPS hostname. Record its current URL and update Razorpay after a tunnel restart. [Cloudflare tunnel setup](https://developers.cloudflare.com/tunnel/setup/)

### D. Make provider mode explicit

Extend `BillingSettings`:

- `BILLING_RAZORPAY_MODE=disabled|test|live`, default `disabled`.
- `BILLING_RAZORPAY_TEST_READY=false`, default false.
- Retain the existing checkout kill switch and live/international readiness switches.
- Add explicit test-region readiness so test USD does not require setting a live international flag.
- Require matching `rzp_test_` or `rzp_live_` key prefixes before provider calls.
- Reject test configuration in production and reject live configuration in the billing-test launcher.
- Permit webhook processing/reconciliation when checkout is disabled.
- Pin credential-bearing API requests to `https://api.razorpay.com/v1`; do not follow redirects to another host.

Canonical credential settings remain:

```text
BILLING_RAZORPAY_KEY_ID
BILLING_RAZORPAY_KEY_SECRET
BILLING_RAZORPAY_WEBHOOK_SECRET
BILLING_QUOTE_SIGNING_SECRET
```

Support the owner’s existing `RAZORPAY_TEST_KEY_ID` and `RAZORPAY_TEST_KEY_SECRET` names as **test-only input aliases**. Reject conflicting canonical/alias values and reject aliases in live mode. Document canonical names in `.env.example`; never print values.

Require an independent quote-signing secret. Remove the runtime dependency on the webhook secret for signing new quotes.

Persist provider mode explicitly on relevant intents, subscriptions, webhook evidence, and receipts. Remove the implicit `"test"` payment-mode default. Mode comes from the validated deployment boundary, not from a browser request or an assumed webhook field.

## 3. Catalog, provider verification, and checkout implementation

### A. Align provisioning with the persisted catalog

`backend/scripts/provision_razorpay_plans.py` currently reads the legacy environment-built catalog; its `verify` operation checks reference presence rather than fetching Razorpay plans.

Replace that behavior:

- Require an explicit persisted catalog revision and provider environment.
- `propose` reads that revision and emits redacted plan specifications without provider I/O.
- `verify` fetches each referenced provider plan and compares name, final gross
  amount, currency, period, and interval. CiteLadder—not provider invoice tax
  metadata—owns the taxable value and tax-component allocation.
- Fail on an empty verification set, missing references, mismatched environment, wrong revision, or any differing provider term.
- Keep provider creation an explicit Dashboard/API operator step; do not introduce an unattended provisioning loop.
- Store plan references in the reviewed immutable catalog payload, then import/publish using the existing audited CLI.
- Remove stale instructions that treat `BILLING_PROVIDER_PRICE_REFS` as the persisted runtime authority.
- Remove the inert catalog `checkout_enabled: Literal[False]` field from the disposable pre-launch payload and fixtures. Operational checkout admission remains owned by settings.

Extend the persisted catalog to represent regional INR/USD prices, private provider references, and frozen FX/tax metadata. Runtime quotes must read frozen catalog values rather than mutable global FX/GST settings.

Keep schema/semantic versions at `1`. Fold relational changes into `0001_initial.py`; reset only the disposable local-staging database.

### B. Define explicit sandbox pricing

Retain current BYOK USD monthly prices: Tier 1 `$49`, Tier 2 `$99`, Tier 3 `$149`.

Use a clearly labelled synthetic fixture:

- FX: `85.00 INR/USD`.
- Test GST rate: `0.18`.
- Metadata: `sandbox-fixture-not-for-production`.
- Monthly interval: `1`.
- Total cycles: `3`, to exercise completion quickly.
- Quantity: `1`.
- No trial or delayed first charge.

| Tier | USD total | INR base | Test GST | INR total |
|---|---:|---:|---:|---:|
| Tier 1 | $49.00 | ₹4,165.00 | ₹749.70 | ₹4,914.70 |
| Tier 2 | $99.00 | ₹8,415.00 | ₹1,514.70 | ₹9,929.70 |
| Tier 3 | $149.00 | ₹12,665.00 | ₹2,279.70 | ₹14,944.70 |

Use decimal arithmetic and the runbook’s base-then-tax `ROUND_HALF_UP` order. Reject synthetic catalog metadata in live mode.

**Tax verification gate:** prove that the merchant’s subscription plan/invoice configuration produces the separate GST line and exact quoted total. Do not assume Razorpay adds GST automatically, embed it twice, or represent a base-only charge as successful parity. If the supported configuration cannot reproduce the agreed invoice treatment, keep INR checkout unavailable and record the precise provider limitation for owner resolution.

### C. Add the Standard Checkout contract

Preserve `POST /api/v1/billing/subscriptions` as the sole subscription-creation endpoint, including its server-resolved quote, ownership checks, idempotency, and commit-before-network behavior.

Add narrowly scoped endpoints under the same billing owner:

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/billing/subscriptions/{activation_id}/checkout` | Owner-authorized persisted checkout initialization: activation UUID, provider mode, public key ID, subscription ID, expiry, display summary. No provider calls. |
| `POST /api/v1/billing/subscriptions/{activation_id}/verify` | Accept the three Razorpay callback fields, verify binding/signature, and request bounded provider reconciliation. |
| `GET /api/v1/billing/activations/{activation_id}` | Owner-authorized persisted pending/activated/failed/abandoned state and safe reason. No provider calls or repairs. |

Only checkout initialization exposes the public key and subscription ID needed by Checkout.js. Catalog responses must continue excluding private plan/customer identifiers.

Verification must:

- Authorize the activation against the authenticated billing owner.
- Compare the callback subscription ID with the stored provider subscription ID.
- Compute HMAC-SHA256 over `payment_id + "|" + stored_subscription_id`, using the API key secret and constant-time comparison.
- Reject malformed, mismatched, or cross-account input before provider settlement.
- Treat a valid callback as authentication evidence, not an entitlement grant.
- Never persist/log raw callback signatures.

Remove the subscription path’s dependency on provider `short_url` and frontend hard navigation. Keep unrelated one-time-payment types untouched and unavailable.

### D. Share one frontend checkout controller

Use one controller from pricing and billing settings:

- Load only `https://checkout.razorpay.com/v1/checkout.js`, lazily after purchase intent.
- Initialize subscriptions with server-provided public key/subscription ID; do not send client-calculated amounts or plan IDs.
- Prefill the signed-in customer’s email, rather than hard-coding the test address.
- Handle script failure, dismissal, payment failure, callback verification failure, and uncertain network results.
- Reuse the pending activation and idempotency key on recoverable retries.
- After callback, show “Payment verification pending”; poll persisted activation status every two seconds for at most one minute, then offer manual refresh.
- Refresh billing usage and workspace entitlements only after server-confirmed activation.
- Keep billing status accessible before the first project exists.
- Show a clear test-mode indicator.

Apply a route-appropriate CSP compatible with Next.js and Checkout.js: narrow script/frame/connect origins, no arbitrary provider-supplied scripts, and no broad wildcard relaxation. Verify desktop and mobile checkout behavior.

## 4. Settlement security and operational recovery

### A. Require paid subscription evidence

Current subscription activation checks subscription state/plan reference without recording a corresponding subscription payment receipt.

Extend the existing activation owner to require:

- Matching subscription, plan, activation, account, catalog revision, and provider mode.
- A captured initial payment associated with that subscription through authoritative payment/invoice evidence.
- Exact amount/currency parity with the frozen quote.
- Valid paid-period boundaries.
- An immutable normalized receipt linked to the subscription and activation.

`authenticated`, a valid browser signature, or `activated` without matching paid evidence must not grant paid access. Renewal grants likewise require a distinct verified paid invoice/payment and period.

Do not infer billing residence from card issuer country. Preserve declared billing country separately and compare available provider billing/tax evidence; missing evidence remains missing.

### B. Extend webhooks and reconciliation together

- Parse subscription events with their accompanying payment evidence.
- Preserve exact-raw-body HMAC, size limits, durable receipt, event-ID/digest checks, leases, and redaction.
- Use the same settlement transaction for webhook and reconciliation results.
- Handle missing `updated_at`, same-second events, reordered delivery, and terminal-state transitions explicitly.
- Acknowledge duplicates without duplicate receipts or grants.
- Keep unknown subscription events unmatched and non-entitling.
- Persist retryable work before acknowledgment; recover crash-after-receipt cases through bounded existing billing reconciliation ownership.
- Resolve ambiguous create outcomes by provider identity/intent metadata before attempting another creation.
- Extend bounded reconciliation to recover missed renewal/cancellation evidence for existing subscriptions, not just initial pending activations.
- Keep HTTP acknowledgment within Razorpay’s documented timeout; move required provider I/O after durable receipt.

Razorpay documents a five-second response window and retries delivery failures for up to 24 hours before disabling the webhook. [Webhook setup and delivery](https://razorpay.com/docs/webhooks/setup-edit-payments/)

Enforce a maximum 24-hour previous-secret overlap with an explicit expiry. Reject expired previous secrets even if accidentally left configured. On compromise, remove old-secret acceptance immediately and reconcile affected deliveries.

### C. Update owner runbooks

Update both current billing operation documents in place, preserving unrelated enterprise-demo material. Add a local test procedure and dated evidence template covering:

1. Credential-name mapping and secret installation without displaying values.
2. Isolated stack startup, database identity checks, and ordinary test-account verification.
3. Subscription and recurring-method enablement verification.
4. HTTPS tunnel startup and exact test webhook URL.
5. Separate webhook secret and alert email; confirm `dev@citeladder.com` is monitored before using it for alerts.
6. Implemented subscription event selection from the code-owned allow-list.
7. Catalog proposal, provider plan creation, real provider verification, import, and publication.
8. Checkout and lifecycle scenarios, with expected database/API outcomes.
9. Reconciliation, tunnel interruption, webhook deactivation, key rotation, and checkout kill-switch recovery.
10. Cancellation of test subscriptions, tunnel shutdown, and exact-target disposable database cleanup.

Document MCP limitations: currently available Razorpay tools are read-only transaction tools. They cannot create plans, generate keys, configure webhooks, or prove Subscriptions enablement. Do not infer test/live mode solely from an MCP connection.

## 5. Validation and completion criteria

### Automated validation

Add meaningful regression coverage for:

- Dev and ordinary login with zero/existing projects; finite, exhausted, and unresolved project allowances.
- Project/usage request failures, retry, and no redirect loop.
- Occupancy totals across linked workspaces and isolation from other billing accounts.
- No email-based privileged grants during public registration/login.
- Canonical/alias credentials, conflicts, mode mismatches, API-host rejection, secret redaction, and test/live admission.
- Persisted regional catalog projection, rounding, immutable terms, real mocked plan verification, and funded checkout refusal.
- Checkout initialization/replay, signature verification, cross-account IDs, callback tampering, and expired intents.
- Captured versus authorized payment, wrong amount/currency/plan/subscription, and payment reuse.
- Callback/webhook/reconciliation races, duplicate/different-digest events, renewal replay, crash recovery, and reordered transitions.
- Cancellation, pending/grace/recovery, halted, expired/completed, secret-overlap expiry, and kill-switch continuity.
- Mocked browser checkout lifecycle and script/CSP failure.

Automated tests use synthetic keys and mocked provider boundaries only; they never read `.env` or contact Razorpay.

After implementation is complete, run from repository root:

```powershell
.\scripts\check.ps1
.\scripts\test.ps1
```

Follow the prescribed retry-delta procedure after failures. Add missing validation mappings; do not hand-select a smaller completion suite. Verify baseline migration and ORM drift from an empty disposable database when schema changes occur.

### Real sandbox acceptance

Record each route as **passed**, **failed**, **merchant-disabled**, or **not simulatable in sandbox**:

| Route | Required scenarios |
|---|---|
| INR domestic cards | Supported credit/debit authorization, capture, renewal, cancellation |
| INR UPI AutoPay | Supported mandate authorization, renewal, failure/recovery, cancellation |
| INR eMandate | Merchant-enabled recurring authentication and lifecycle |
| USD international cards | Authorization, currency/amount parity, renewal, cancellation |
| All tiers | Correct server quote, provider plan, receipt, and resulting grant bundle |

International recurring payments are card-only; UPI/eMandate are INR routes. Merchant capability and mandate limits must be verified rather than inferred from general gateway approval. [Supported recurring methods](https://razorpay.com/docs/payments/subscriptions/supported-banks-apps/?preferred-country=IN)

Use Razorpay’s test lifecycle controls to exercise subsequent charges and completion; schedule card renewal tests within its documented test-token window. [Testing subscriptions](https://razorpay.com/docs/payments/subscriptions/test/?preferred-country=IN)

Also prove:

- Closing Checkout or forging a callback grants nothing.
- Stopping the tunnel does not lose a captured payment permanently.
- Reconciliation and delayed delivery converge without duplicate access.
- Cancellation preserves only verified paid time.
- Existing project evidence remains readable after entitlement expiry.
- An invited member receives only the correct workspace sponsor’s access.

Implementation completion requires green repository gates and an honest sandbox evidence record. Unsupported or unverified methods remain disabled and explicitly outstanding. Sandbox success does not enable live checkout or establish real settlement, production tax compliance, or merchant approval.

The billing operator guide records sandbox acceptance requirements. Merchant capabilities, actual test payments and tax parity remain unverified until exercised.

## Implementation handoff — 2026-09-08

The subscription Checkout, callback verification, receipt-gated activation and
renewal recovery, persisted regional catalog, isolated stack and operator tools
are implemented in the current change. The [manual testing runbook](../../operations/razorpay-local-testing.md)
provides the owner-run acceptance sequence and expected evidence. Local INR
and international approval are owner-confirmed; international setup/readiness
remains unverified and disabled. Real sandbox captures, recurring-method
acceptance and GST parity have not been performed and are not marked complete.
Funded checkout remains disabled as specified in section 1. Per the owner's
instruction, further suites run in CI, not locally; PR completion remains
contingent on green CI and review fixes.
