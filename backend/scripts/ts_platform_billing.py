"""Billing policy export; Python config remains the single policy authority."""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import billing_contracts
from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config.billing_settings import BillingSettings
from app.core.config.provider_catalog import (
    PUBLIC_PROVIDER_CATALOG,
    public_provider_routes,
)
from app.core.config.razorpay_settings import RAZORPAY_API_ORIGIN, RazorpaySettings
from app.core.config.site_health_runtime import SiteHealthSettings

Setting = Callable[[str, type[BaseSettings]], dict[str, Any]]


def billing_policy(setting: Setting) -> dict[str, Any]:
    return {
        "settings": {
            name: setting(name, BillingSettings)
            for name in BillingSettings.model_fields
        },
        "razorpay_settings": {
            name: setting(name, RazorpaySettings)
            for name in RazorpaySettings.model_fields
        },
        "razorpay_origin": RAZORPAY_API_ORIGIN,
        "contracts": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(billing_contracts).items()
            if name.isupper()
        },
        "providers": [
            {
                **dataclasses.asdict(entry),
                "routes": [
                    {
                        "logical_engine": route.logical_engine,
                        "transport_provider": route.transport_provider,
                        "model": route.transport_model,
                    }
                    for route in public_provider_routes(entry.key)
                ],
            }
            for entry in PUBLIC_PROVIDER_CATALOG
        ],
    }


def site_health_runtime_policy(setting: Setting) -> dict[str, Any]:
    return {
        "settings": {
            name: setting(name, SiteHealthSettings)
            for name in (
                "automatic_page_limit",
                "sample_url_limit",
                "sample_discovery_url_cap",
            )
        },
        "full_mode": crawl_policy.DISCOVERY_MODE_FULL,
        "sample_mode": crawl_policy.DISCOVERY_MODE_SAMPLE,
        "full_minimum": crawl_policy.MIN_FULL_DISCOVERY_URL_CAP,
        "full_headroom": crawl_policy.FULL_DISCOVERY_HEADROOM,
    }
