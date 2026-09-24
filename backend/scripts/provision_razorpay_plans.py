"""Propose, verify or bind the Razorpay plans of one persisted catalog revision.

Provider plans are immutable artifacts keyed by (catalog revision, SKU,
region, credential mode): each recurring price entry of a revision names the
one plan whose amount, currency and cadence it was verified against.

* ``propose`` prints the plan spec for every recurring SKU x region.
* ``bind`` reads the plan ids an operator created (a JSON object keyed
  ``"{plan}:{region}"``), verifies each against its frozen terms, and writes a
  payload for a NEW revision (import it with ``billing_admin catalog-import``).
  Existing subscribers stay pinned to the plans they authorised; only new
  checkouts use the new revision once it is published.
* ``verify`` re-checks every plan already bound in a revision.

One-time SKUs (add-ons, top-ups, upgrade proration) are Orders and need no
plan. Creation remains an explicit operator Dashboard/API action.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import httpx

from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.core.config.razorpay_settings import razorpay_settings
from app.core.database import SessionLocal, dispose_engine
from app.domain.billing.catalog_revisions import catalog_revision, validate_payload

PriceEntry = tuple[str, str, dict]


def _validate_environment(environment: str) -> None:
    if razorpay_settings.require_provider_mode() != environment:
        raise RuntimeError("Configured provider mode does not match --environment")


def verify_plan(actual: dict, price: dict) -> None:
    item = actual.get("item", {})
    expected = {
        "name": price["provider_plan_name"],
        # Razorpay plans carry the recurring amount, not CiteLadder's tax
        # allocation. Provision the exact gross amount that checkout quotes.
        "amount": price["amount_minor"] + price["tax_minor"],
        "currency": price["currency"],
    }
    if any(item.get(key) != value for key, value in expected.items()):
        raise ValueError("Provider plan item differs from frozen catalog terms")
    if (
        actual.get("period") != price["period"]
        or actual.get("interval") != price["interval"]
    ):
        raise ValueError("Provider plan cadence differs from frozen catalog terms")
    if price["tax_minor"] and not price["tax_verified"]:
        raise ValueError("CiteLadder GST policy remains operator-unverified")


def workspace_path(value: str) -> Path:
    """A CLI-supplied file path, refused outside the working directory."""
    workspace = Path.cwd().resolve()
    resolved = (workspace / value).resolve()
    if not resolved.is_relative_to(workspace):
        raise ValueError(f"Path must stay within {workspace}")
    return resolved


def _require_plan_reference(reference: str) -> None:
    if (
        not reference
        or not reference.startswith("plan_")
        or not reference[5:].isalnum()
    ):
        raise ValueError("Missing or malformed provider plan reference")


def recurring_prices(payload: Mapping[str, object]) -> list[PriceEntry]:
    """Every recurring (plan, region, price) entry of a validated payload."""
    parsed = validate_payload(dict(payload))
    return [
        (plan.key, region, price.model_dump())
        for plan in parsed.plans
        for region, price in plan.regional_byok_prices.items()
    ]


def bind_plan_refs(
    payload: Mapping[str, object], refs: Mapping[str, str]
) -> dict[str, object]:
    """A copy of ``payload`` with EVERY recurring price bound to its plan id.

    The mapping must name exactly the revision's recurring SKU x region set:
    a missing or an unknown key is refused rather than half-binding a
    revision.
    """
    bound: dict[str, Any] = copy.deepcopy(dict(payload))
    expected = {f"{key}:{region}" for key, region, _ in recurring_prices(bound)}
    if set(refs) != expected:
        raise ValueError(
            f"Plan ids must cover exactly {sorted(expected)}; got {sorted(refs)}"
        )
    for plan in bound["plans"]:
        for region, price in plan.get("regional_byok_prices", {}).items():
            reference = refs[f"{plan['key']}:{region}"]
            _require_plan_reference(reference)
            price["provider_price_ref"] = reference
    validate_payload(bound)
    return bound


async def _load(revision: str) -> dict[str, object]:
    async with SessionLocal() as session:
        row = await catalog_revision(session, revision)
        payload = dict(row.payload)
        await session.commit()
    return payload


def _require_environment_prices(prices: Sequence[PriceEntry], environment: str) -> None:
    if not prices:
        raise ValueError("Empty provider verification set")
    if any(price["provider_mode"] != environment for _, _, price in prices):
        raise ValueError("Catalog provider environment mismatch")


async def _verify_prices(
    prices: Sequence[PriceEntry], revision: str, environment: str
) -> None:
    _validate_environment(environment)
    async with httpx.AsyncClient(follow_redirects=False) as client:
        provider = RazorpayBillingProvider(client=client)
        for key, region, price in prices:
            reference = price["provider_price_ref"]
            _require_plan_reference(reference)
            verify_plan(await provider.fetch_plan(reference), price)
            print(f"verified {revision} {key} {region}")


async def _run(
    args: argparse.Namespace, refs: Mapping[str, str] | None
) -> dict[str, object] | None:
    """Run one operation; ``bind`` returns the verified payload to write."""
    payload = await _load(args.revision)
    prices = recurring_prices(payload)
    _require_environment_prices(prices, args.environment)
    if args.operation == "propose":
        for key, region, price in prices:
            spec = {k: v for k, v in price.items() if k != "provider_price_ref"}
            entry = {"plan": key, "region": region, "spec": spec}
            print(json.dumps({"revision": args.revision, **entry}))
        return None
    if args.operation == "verify":
        await _verify_prices(prices, args.revision, args.environment)
        return None
    bound = bind_plan_refs(payload, refs or {})
    await _verify_prices(recurring_prices(bound), args.revision, args.environment)
    return bound


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("propose", "verify", "bind"))
    parser.add_argument("--revision", required=True)
    parser.add_argument("--environment", required=True, choices=("test", "live"))
    parser.add_argument("--plans", help="bind: JSON {'plan:region': 'plan_...'}")
    parser.add_argument("--output", help="bind: where to write the new payload")
    args = parser.parse_args()
    if args.operation == "bind" and not (args.plans and args.output):
        parser.error("bind requires --plans and --output")
    refs = (
        json.loads(workspace_path(args.plans).read_text(encoding="utf-8"))
        if args.plans
        else None
    )

    async def run() -> dict[str, object] | None:
        try:
            return await _run(args, refs)
        finally:
            await dispose_engine()

    bound = asyncio.run(run())
    if bound is not None:
        workspace_path(args.output).write_text(
            json.dumps(bound, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"wrote the bound payload for a new revision to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
