"""Read an explicit persisted catalog revision; propose or verify Razorpay plans.

Creation remains an explicit operator Dashboard/API action.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Sequence

import httpx

from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.core.config.billing_settings import billing_settings
from app.core.database import SessionLocal, dispose_engine
from app.domain.billing.catalog_revisions import catalog_revision, validate_payload


def _validate_environment(environment: str) -> None:
    if billing_settings.require_provider_mode() != environment:
        raise RuntimeError("Configured provider mode does not match --environment")


def verify_plan(actual: dict, price: dict) -> None:
    item = actual.get("item", {})
    expected = {
        "name": price["provider_plan_name"],
        "amount": price["amount_minor"],
        "currency": price["currency"],
    }
    if any(item.get(key) != value for key, value in expected.items()):
        raise ValueError("Provider plan item differs from frozen catalog terms")
    if (
        actual.get("period") != price["period"]
        or actual.get("interval") != price["interval"]
    ):
        raise ValueError("Provider plan cadence differs from frozen catalog terms")
    if item.get("tax_amount", 0) != price["tax_minor"]:
        raise ValueError("Provider plan tax differs from frozen catalog terms")
    if price["tax_minor"] and (
        not price["tax_verified"]
        or item.get("tax_amount") != price["tax_minor"]
        or item.get("tax_inclusive") is not False
    ):
        raise ValueError("Separate GST line and exact total remain unverified")


async def _run(operation: str, revision: str, environment: str) -> None:
    async with SessionLocal() as session:
        row = await catalog_revision(session, revision)
        payload = validate_payload(row.payload)
        prices = [
            (plan.key, region, price.model_dump())
            for plan in payload.plans
            for region, price in plan.regional_byok_prices.items()
        ]
        await session.commit()
    if not prices:
        raise ValueError("Empty provider verification set")
    if any(price["provider_mode"] != environment for _, _, price in prices):
        raise ValueError("Catalog provider environment mismatch")
    if operation == "propose":
        for key, region, price in prices:
            spec = {k: v for k, v in price.items() if k != "provider_price_ref"}
            print(
                json.dumps(
                    {"revision": revision, "plan": key, "region": region, "spec": spec}
                )
            )
        return
    await _verify_prices(prices, revision, environment)


async def _verify_prices(
    prices: Sequence[tuple[str, str, dict]], revision: str, environment: str
) -> None:
    _validate_environment(environment)
    async with httpx.AsyncClient(follow_redirects=False) as client:
        provider = RazorpayBillingProvider(client=client)
        for key, region, price in prices:
            reference = price["provider_price_ref"]
            if (
                not reference
                or not reference.startswith("plan_")
                or not reference[5:].isalnum()
            ):
                raise ValueError("Missing or malformed provider plan reference")
            verify_plan(await provider.fetch_plan(reference), price)
            print(f"verified {revision} {key} {region}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("propose", "verify"))
    parser.add_argument("--revision", required=True)
    parser.add_argument("--environment", required=True, choices=("test", "live"))
    args = parser.parse_args()

    async def run() -> None:
        try:
            await _run(args.operation, args.revision, args.environment)
        finally:
            await dispose_engine()

    asyncio.run(run())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
