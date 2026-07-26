"""Razorpay Subscriptions adapter. Translation and transport only."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.connectors.billing.base import (
    BillingProviderError,
    HostedSubscription,
    ProviderSubscription,
)
from app.core.config.billing import BillingSettings, billing_settings


class RazorpayBillingProvider:
    def __init__(
        self,
        *,
        settings: BillingSettings = billing_settings,
        client: httpx.AsyncClient,
    ) -> None:
        self.settings = settings
        self._client = client

    def _auth(self) -> httpx.BasicAuth:
        key_id = self.settings.razorpay_key_id.strip()
        secret = self.settings.razorpay_key_secret.get_secret_value()
        if not key_id or not secret:
            raise BillingProviderError("provider_not_configured")
        return httpx.BasicAuth(key_id, secret)

    async def _request(
        self, method: str, path: str, *, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        try:
            response = await self._client.request(
                method,
                f"{self.settings.razorpay_api_base_url.rstrip('/')}{path}",
                auth=self._auth(),
                json=payload,
                timeout=self.settings.request_timeout_seconds,
            )
        except httpx.TransportError as exc:
            raise BillingProviderError("provider_unavailable", retryable=True) from exc
        if response.status_code >= 400:
            code = (
                "provider_rejected"
                if response.status_code < 500
                else "provider_unavailable"
            )
            raise BillingProviderError(code, retryable=response.status_code >= 500)
        try:
            data = response.json()
        except ValueError as exc:
            raise BillingProviderError("provider_invalid_response") from exc
        if not isinstance(data, dict):
            raise BillingProviderError("provider_invalid_response")
        return data

    def _subscription(self, data: dict[str, Any]) -> ProviderSubscription:
        external_id = data.get("id")
        status = data.get("status")
        if not isinstance(external_id, str) or not isinstance(status, str):
            raise BillingProviderError("provider_invalid_response")
        return ProviderSubscription(
            external_subscription_id=external_id,
            status=status,
            current_start=_optional_int(data.get("current_start")),
            current_end=_optional_int(data.get("current_end")),
            updated_at=_optional_int(data.get("updated_at")) or 0,
            cancel_at_period_end=_provider_bool(data.get("cancel_at_cycle_end")),
        )

    def _validated_checkout_url(self, value: object) -> str:
        if not isinstance(value, str) or len(value) > 2048:
            raise BillingProviderError("provider_invalid_checkout_url")
        parsed = urlsplit(value)
        if (
            parsed.scheme.lower() != "https"
            or not parsed.hostname
            or parsed.hostname.lower() not in self.settings.checkout_hosts()
            or parsed.username
            or parsed.password
        ):
            raise BillingProviderError("provider_invalid_checkout_url")
        return value

    async def create_subscription(
        self, *, plan_id: str, attempt_id: str, billing_account_id: str
    ) -> HostedSubscription:
        existing = await self._find_subscription_by_attempt(attempt_id)
        if existing is not None:
            return self._hosted_subscription(existing)
        data = await self._request(
            "POST",
            "/subscriptions",
            payload={
                "plan_id": plan_id,
                "total_count": self.settings.subscription_total_cycles,
                "customer_notify": 1,
                "notes": {
                    "searchify_attempt_id": attempt_id,
                    "searchify_billing_account_id": billing_account_id,
                },
            },
        )
        return self._hosted_subscription(data)

    def _hosted_subscription(self, data: dict[str, Any]) -> HostedSubscription:
        subscription = self._subscription(data)
        return HostedSubscription(
            external_subscription_id=subscription.external_subscription_id,
            checkout_url=self._validated_checkout_url(data.get("short_url")),
            status=subscription.status,
        )

    async def _find_subscription_by_attempt(
        self, attempt_id: str
    ) -> dict[str, Any] | None:
        since = (
            int(datetime.now(UTC).timestamp())
            - self.settings.reconciliation_lookback_seconds
        )
        data = await self._request(
            "GET",
            f"/subscriptions?count={self.settings.reconciliation_list_count}&from={since}",
        )
        items = data.get("items")
        if not isinstance(items, list):
            raise BillingProviderError("provider_invalid_response")
        for item in items:
            if not isinstance(item, dict):
                continue
            notes = item.get("notes")
            if (
                isinstance(notes, dict)
                and notes.get("searchify_attempt_id") == attempt_id
            ):
                if item.get("short_url"):
                    return item
                external_id = item.get("id")
                if not isinstance(external_id, str):
                    raise BillingProviderError("provider_invalid_response")
                return await self._request("GET", f"/subscriptions/{external_id}")
        return None

    async def fetch_subscription(
        self, external_subscription_id: str
    ) -> ProviderSubscription:
        return self._subscription(
            await self._request("GET", f"/subscriptions/{external_subscription_id}")
        )

    async def cancel_subscription(
        self, external_subscription_id: str, *, at_cycle_end: bool
    ) -> ProviderSubscription:
        return self._subscription(
            await self._request(
                "POST",
                f"/subscriptions/{external_subscription_id}/cancel",
                payload={"cancel_at_cycle_end": 1 if at_cycle_end else 0},
            )
        )


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _provider_bool(value: object) -> bool:
    return value is True or value == 1
