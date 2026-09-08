# Billing operator guide

> **Audience:** trusted CiteLadder operators with a persisted active `admin` user.
> **Scope:** catalog publication, introductory-offer controls, grant correction,
> evidence inspection, reconciliation, webhook-secret rotation, and incident
> switches. This guide does not authorize production checkout or a campaign.

## Safety contract

Run commands from `backend/` against the explicitly selected database. Never put
provider secrets, customer payment data, operator codes, or raw webhook bodies on
the command line or in an incident ticket.

The CLI cannot create or promote its first admin. Bootstrap an administrator
through the deployment's separately reviewed identity/database procedure; never
use `provision_dev_login.py` outside development and never pass a password or
secret on argv.

Every `billing_admin` mutation requires all of:

- an explicit target (`--revision`, `--account-id`, or `--grant-id`);
- `--actor`, resolving to a persisted, active admin UUID or email;
- a concise `--reason` (maximum 255 characters);
- a unique, stable `--idempotency-key` for the logical operation;
- a reviewed default dry-run before the same command is repeated with `--apply`.

`billing_admin` is dry-run by default. There is no `--dry-run` flag: omitting
`--apply` rolls the transaction back and returns `"dry_run": true`. Validation
and diff commands are read-only and do not require mutation metadata. CLI output
is redacted and exceptions expose only their type.

Use a fresh idempotency key for a different logical request. Reuse the original
key only to replay the same request. Save the command, redacted output, reviewer,
time, database/environment, and resulting row IDs in the change record.

```bash
cd backend
uv run python -m scripts.billing_admin --help
```

## Catalog validation, publication, and recovery

Catalog revisions are immutable rows in `billing_catalog_revisions`. Runtime
reads use the single `published` row and fail closed if none exists. Publication
retires the previously published row; it does not mutate subscription terms
already frozen on accepted subscriptions or periods.

### Import and publish a revision

```bash
# Pure schema and approved-policy validation.
uv run python -m scripts.billing_admin catalog-validate --file /review/catalog.json

# Compare the candidate with the currently published payload.
uv run python -m scripts.billing_admin catalog-diff --file /review/catalog.json

# Dry-run the immutable draft import.
uv run python -m scripts.billing_admin catalog-import \
  --revision commercial-2026-09-08-r1 \
  --file /review/catalog.json \
  --actor admin@example.com \
  --reason "approved catalog change CR-123" \
  --idempotency-key catalog-import:commercial-2026-09-08-r1

# Repeat exactly, adding --apply after review.
uv run python -m scripts.billing_admin catalog-import \
  --revision commercial-2026-09-08-r1 \
  --file /review/catalog.json \
  --actor admin@example.com \
  --reason "approved catalog change CR-123" \
  --idempotency-key catalog-import:commercial-2026-09-08-r1 \
  --apply

# Dry-run, then apply publication.
uv run python -m scripts.billing_admin catalog-publish \
  --revision commercial-2026-09-08-r1 \
  --actor admin@example.com \
  --reason "publish approved catalog CR-123" \
  --idempotency-key catalog-publish:commercial-2026-09-08-r1
# Repeat the same command with --apply after review.
```

### Rollback means forward-publish

There is deliberately no in-place edit, unpublish, or `catalog-rollback`
command. To recover from a bad publication:

1. Set `BILLING_CHECKOUT_ENABLED=false` if new checkout could be affected.
2. Export/reconstruct the last approved payload from its immutable revision.
3. Import that payload under a **new** revision ID with incident/change evidence.
4. Validate, diff, dry-run, review, and publish the new revision.
5. Confirm the former revision is `retired` and the recovery revision is the
   sole `published` row.

Do not republish by editing database state manually. Existing subscriptions keep
their frozen accepted terms; decide any customer correction separately.

## No-card offer and card trial controls

The no-card Tier 1 campaign is catalog-governed. The seeded payload is
`state=draft`, `enabled=false`, `claim_available=false`, with no cohort start.
These lifecycle fields move together under catalog validation. To enable or end
the offer, prepare and publish a new reviewed catalog revision; there is no
runtime environment toggle and no offer-admin dashboard.

Before enabling, verify Phase 4 acceptance, exact cohort start/end, seven-day
Tier 1 terms, eligibility policy, optional operator-code policy, and support
ownership. Claims require explicit terms and data-sharing consent and are atomic,
idempotent, and once per billing account across introductory variants. To stop
new claims, forward-publish a revision with the campaign ended/disabled. Existing
claims retain their recorded expiry unless the account owner uses the supported
end-early-access endpoint or an operator performs a separately approved grant
correction.

The future card-trial quote remains unavailable, collects no card details, and
must not be represented as launch-ready. No catalog publication or environment
flag currently enables it.

## Account inspection and grant correction

Inspect the account before and after every correction:

```bash
uv run python -m scripts.billing_admin account-inspect \
  --account-id <billing-account-uuid> \
  --actor admin@example.com \
  --reason "investigate support case BILL-42" \
  --idempotency-key account-inspect:BILL-42:before
```

`account-inspect` currently returns safe account status and grant IDs, not
payment data or secrets. Mutations still use the standard dry-run/apply contract.

Issue an additive override grant:

```bash
uv run python -m scripts.billing_admin grant \
  --account-id <billing-account-uuid> \
  --key monitored_urls \
  --value 50 \
  --actor admin@example.com \
  --reason "approved correction BILL-42" \
  --idempotency-key grant:BILL-42:monitored-urls
# Review, then repeat with --apply.
```

Allowances can combine across grants; an override does not replace an earlier
row. Never “correct” a value by issuing an uncalculated opposite grant. Revoke
the exact erroneous grant, then issue the approved replacement if required:

```bash
uv run python -m scripts.billing_admin revoke \
  --grant-id <grant-uuid> \
  --actor admin@example.com \
  --reason "revoke erroneous grant from BILL-42" \
  --idempotency-key revoke:BILL-42:<grant-uuid>
# Review, then repeat with --apply.
```

Grant and revocation records are append-only. Do not update or delete them with
ad-hoc SQL. Confirm the workspace-effective entitlement through the authenticated
`GET /api/v1/workspaces/{workspace_id}/entitlements` boundary after correction.

## Payment, receipt, subscription, and ledger inspection

There is no broad payment-inspection CLI. Use read-only SQL through an approved,
audited database session, select only necessary columns, and never copy raw
provider payloads or secret material. Start from internal UUIDs and normalized
identities:

```sql
-- Pending commercial intent and reconciliation state.
SELECT id, billing_account_id, activation_kind, catalog_key, catalog_revision,
       credential_mode, status, provider, external_reference, settled_by,
       settled_authority_id, failure_code, reconciliation_attempts,
       reconciliation_next_at, reconciliation_lease_expires_at,
       created_at, activated_at, failed_at
FROM pending_activations
WHERE billing_account_id = '<account-uuid>'
ORDER BY created_at DESC;

-- Normalized payment/refund receipts. Do not export provider identifiers unless needed.
SELECT id, pending_activation_id, subscription_id, parent_payment_id,
       receipt_kind, amount_minor, currency, provider_mode, status, paid_at,
       receipt_sha256
FROM billing_payments
WHERE billing_account_id = '<account-uuid>'
ORDER BY created_at DESC;

-- Frozen subscription authority.
SELECT id, catalog_revision, catalog_key, subscription_kind, cadence,
       credential_mode, quantity, currency, status, current_period_start,
       current_period_end, cancel_at_period_end, provider_state_version,
       is_current, created_at, ended_at
FROM billing_subscriptions
WHERE billing_account_id = '<account-uuid>'
ORDER BY created_at DESC;

-- Immutable grant and consumable accounting trail.
SELECT id, source_kind, bundle_role, profile_key, key, value, valid_from,
       valid_until, source_ref, bundle_id, created_at
FROM account_grants
WHERE billing_account_id = '<account-uuid>'
ORDER BY created_at, id;

SELECT id, grant_id, capability_key, entry_kind, reservation_id, subject_kind,
       subject_id, dispatch_key, allocation_order, refund_of_id, attempt, units,
       created_at
FROM consumable_ledger
WHERE billing_account_id = '<account-uuid>'
ORDER BY created_at, allocation_order, id;
```

Verify accounting with immutable entries: grant value minus reservations plus
releases minus debits, with refunds tied to `refund_of_id`. Typed subjects must
match the Content, Agent, or audit parent evidence. Payment/refund receipts are
normalized and digest-bound; cumulative refunds may not exceed the payment.
Never infer entitlement merely from a redirect, Payment Link, receipt, or
provider dashboard—the accepted activation and resulting grants are authority.

For model-funded work also inspect `content_generation_attempts` or
`agent_model_attempts` for frozen route/key revisions, dispatch identity, usage
completeness, and settlement status. Customer BYOK attempts have zero platform
credit debit. Platform-funded calls remain unavailable unless the published
catalog contains an explicit finite AI-credit policy and the account has an
allowance.

## Reconciliation

The one-shot reconciliation command is bounded and idempotent. It claims stale
pending activations, queries provider authority, and settles through the same
transaction as webhooks. It prints safe counts only.

```bash
cd backend
uv run python -m scripts.reconcile_billing --batch-size 50
```

Run it when webhook delivery is delayed, an accepted create outcome is uncertain,
or monitoring reports stale pending activations. Do not loop it aggressively or
increase bounds without review. A run-level failure exits nonzero; per-row
provider errors remain pending and appear in counts. Record counts and then
inspect affected pending rows, webhook results, normalized receipts, grants, and
ledger entries. Reconciliation is not evidence that production provider behavior
has been tested.

## Webhook-secret rotation

The runtime verifies the active `BILLING_RAZORPAY_WEBHOOK_SECRET` and optional
`BILLING_RAZORPAY_WEBHOOK_PREVIOUS_SECRET`. Secret values belong only in the
deployment secret manager.

1. Confirm webhook monitoring and reconciliation access.
2. Generate/install the new secret as the active value and move the former
   active value to the previous setting in one reviewed deployment.
3. Update Razorpay through its authorized dashboard/API procedure.
4. Verify signed deliveries, duplicate idempotency, and no signature-failure
   spike. Reconcile deliveries that failed during the change.
5. Keep the previous secret for a bounded overlap of at most 24 hours.
6. Remove the previous value and redeploy; record removal evidence.

On suspected compromise, rotate immediately, keep no extended overlap, disable
new checkout, and reconcile all deliveries in the affected window. Never log or
paste either secret.

## Incident switches and response order

- `BILLING_CHECKOUT_ENABLED=false`: primary kill switch for **new checkout**.
  Webhook processing and reconciliation remain available so existing payment
  evidence can settle.
- `BILLING_RAZORPAY_LIVE_READY=false`: blocks live-provider readiness.
- `BILLING_RAZORPAY_INTERNATIONAL_READY=false`: blocks the USD/international
  route independently.
- Campaign incident: forward-publish a catalog with the no-card campaign
  ended/disabled; do not rely on checkout flags because the no-card offer is
  independent of Razorpay.
- Platform-funded AI incident: publish a reviewed catalog without the affected
  AI-credit policy/route or remove the operational route reference through its
  owning procedure; customer BYOK must never silently fall back to platform.

Recommended response order: stop new admission, preserve webhook ingress,
capture redacted evidence, inspect normalized state, reconcile bounded pending
rows, correct through append-only grants/refunds or forward publication, verify
workspace-effective access, then reopen only after review.

## Current release posture

Checkout is disabled by default. The no-card campaign is disabled by default.
The card trial is unavailable. Tests use deterministic fixtures and mocked
provider boundaries; there is no production Razorpay lifecycle, payment,
invoice, settlement, refund, or webhook-rotation evidence. Keep all launch flags
false until the separate owner requirements and live go/no-go record are
complete.
