"""Explicit Razorpay plan verifier/creator; never runs during app startup.

Examples (from backend/):
  uv run python -m scripts.provision_razorpay_plans propose --environment test
  uv run python -m scripts.provision_razorpay_plans verify --environment test
  uv run python -m scripts.provision_razorpay_plans create --environment test
  uv run python -m scripts.provision_razorpay_plans create --environment live \
      --confirm-live billing-v1
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

from app.core.config.billing import billing_settings, quote_for_country


def _payload(country: str) -> dict[str, Any]:
    quote = quote_for_country(country)
    if quote.total_amount_minor <= 0:
        raise ValueError("INR price is not configured; set BILLING_USD_INR_RATE first")
    return {
        "period": "monthly",
        "interval": 1,
        "item": {
            "name": f"Searchify Paid ({quote.currency})",
            # India charges the base plus GST as the recurring total. Razorpay
            # merchant invoice/tax configuration must separately show the
            # legally approved base/tax split before live use.
            "amount": quote.total_amount_minor,
            "currency": quote.currency,
            "description": (
                f"{billing_settings.catalog_version}; base="
                f"{quote.base_amount_minor}; tax={quote.tax_amount_minor}"
            ),
        },
    }


def _request(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    key_id = billing_settings.razorpay_key_id.strip()
    secret = billing_settings.razorpay_key_secret.get_secret_value()
    if not key_id or not secret:
        raise RuntimeError(
            "BILLING_RAZORPAY_KEY_ID and BILLING_RAZORPAY_KEY_SECRET are required"
        )
    response = client.request(
        method,
        f"{billing_settings.razorpay_api_base_url.rstrip('/')}{path}",
        auth=httpx.BasicAuth(key_id, secret),
        json=payload,
        timeout=billing_settings.request_timeout_seconds,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Razorpay returned HTTP {response.status_code}")
    data = response.json()
    if not isinstance(data, dict):
        raise RuntimeError("Razorpay returned an invalid response")
    return data


def _configured_plan_id(country: str) -> str:
    if country == "IN":
        return billing_settings.razorpay_paid_monthly_inr_plan_id.strip()
    return billing_settings.razorpay_paid_monthly_usd_plan_id.strip()


def _verify(actual: dict[str, Any], expected: dict[str, Any]) -> None:
    item = actual.get("item")
    if not isinstance(item, dict):
        raise RuntimeError("configured plan has no item")
    for key, value in (
        ("period", expected["period"]),
        ("interval", expected["interval"]),
    ):
        if actual.get(key) != value:
            raise RuntimeError(f"configured plan drift: {key}")
    for key in ("amount", "currency"):
        if item.get(key) != expected["item"][key]:
            raise RuntimeError(f"configured plan drift: item.{key}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("propose", "verify", "create"))
    parser.add_argument("--environment", required=True, choices=("test", "live"))
    parser.add_argument("--confirm-live", default="")
    args = parser.parse_args()
    if (
        args.operation == "create"
        and args.environment == "live"
        and args.confirm_live != billing_settings.catalog_version
    ):
        parser.error(
            f"live creation requires --confirm-live {billing_settings.catalog_version}"
        )

    proposals = {"INR": _payload("IN"), "USD": _payload("US")}
    print(json.dumps({"environment": args.environment, "plans": proposals}, indent=2))
    if args.operation == "propose":
        return 0
    with httpx.Client() as client:
        for country, currency in (("IN", "INR"), ("US", "USD")):
            plan_id = _configured_plan_id(country)
            if plan_id:
                actual = _request(client, "GET", f"/plans/{plan_id}")
                _verify(actual, proposals[currency])
                print(f"verified {currency} plan: {plan_id}")
                continue
            if args.operation == "verify":
                raise RuntimeError(f"no configured {currency} plan id")
            created = _request(client, "POST", "/plans", payload=proposals[currency])
            created_id = created.get("id")
            if not isinstance(created_id, str):
                raise RuntimeError("created plan response had no id")
            print(f"created {currency} plan; configure id: {created_id}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        print(f"plan operation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
