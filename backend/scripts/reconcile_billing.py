"""Recover durable webhook receipts, current subscriptions and pending intents.

The default runs one bounded sweep; --watch repeats sweeps at the configured
interval for the isolated billing stack. Provider I/O follows committed claims
and settlement shares the webhook owners. Credentials come only from settings.
Run-level failures exit nonzero so the staging service can restart.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime

from app.connectors.billing.http_client import aclose_shared_billing_clients
from app.core.config.billing_settings import billing_settings
from app.core.database import SessionLocal
from app.domain.billing.reconciliation import reconcile_pending_activations
from app.domain.billing.subscription_recovery import reconcile_current_subscriptions
from app.domain.billing.webhook_recovery import recover_webhook_receipts


async def _run(batch_size: int) -> dict[str, int]:
    try:
        async with SessionLocal() as session:
            # No adapter is passed: every claimed row is settled against the
            # provider and environment PERSISTED on it. Forcing one adapter
            # here would send a second provider's records to the first.
            webhook_count = await recover_webhook_receipts(session)
            subscription_count = await reconcile_current_subscriptions(session)
        summary = await reconcile_pending_activations(
            SessionLocal,
            now=datetime.now(UTC),
            batch_size=batch_size,
        )
    finally:
        await aclose_shared_billing_clients()
    return {
        **summary.as_counts(),
        "webhooks_claimed": webhook_count,
        "subscriptions_claimed": subscription_count,
    }


async def _watch(batch_size: int) -> None:
    while True:
        print(json.dumps(await _run(batch_size), sort_keys=True), flush=True)
        await asyncio.sleep(billing_settings.reconciliation_poll_seconds)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--batch-size",
        type=int,
        default=billing_settings.reconciliation_batch_size,
        help="Maximum pending activations claimed in this one-shot run.",
    )
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    if args.batch_size < 1:
        print("--batch-size must be >= 1", file=sys.stderr)
        return 2
    try:
        if args.watch:
            asyncio.run(_watch(args.batch_size))
            return 0
        counts = asyncio.run(_run(args.batch_size))
    except Exception as exc:  # noqa: BLE001 - run-level failure only
        print(f"reconciliation run failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    # Safe counts only: no account id, provider id, amount, or message.
    print(json.dumps(counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
