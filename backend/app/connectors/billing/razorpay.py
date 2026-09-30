"""Read-only Razorpay plan verification for the retained operator CLI.

Runtime checkout, payments, refunds and recovery are TypeScript-owned. Remove
this bridge when provision_razorpay_plans migrates with catalog administration.
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config.billing_settings import billing_settings
from app.core.config.razorpay_settings import (
    RAZORPAY_API_ORIGIN,
    RazorpaySettings,
    razorpay_settings,
)


class RazorpayPlanReader:
    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        settings: RazorpaySettings = razorpay_settings,
    ) -> None:
        self.settings = settings
        self.client = client

    async def fetch_plan(self, reference: str) -> dict[str, Any]:
        self.settings.require_provider_mode()
        if not re.fullmatch(r"plan_[A-Za-z0-9]+", reference):
            raise ValueError("Invalid plan reference")
        response = await self.client.get(
            f"{RAZORPAY_API_ORIGIN}/plans/{reference}",
            auth=httpx.BasicAuth(
                self.settings.key_id, self.settings.key_secret.get_secret_value()
            ),
            timeout=billing_settings.request_timeout_seconds,
            follow_redirects=False,
        )
        if response.is_redirect:
            raise ValueError("Provider redirect rejected")
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or data.get("id") != reference:
            raise ValueError("Provider plan reference mismatch")
        return data
