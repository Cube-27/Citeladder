"""Razorpay Subscriptions + Payment Links adapter. Translation/transport only.

Every method takes only server-resolved arguments (a PRIVATE ``price_ref``
from config, an opaque intent id, an opaque account ref) and validates the
response shape, the hosted URL host, the echoed price ref, and the expected
amount/currency before the domain sees it. No commercial amount, catalog key,
status vocabulary, or tax rule is decided here — config owns all of it.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.connectors.billing.base import (
    BillingProviderError,
    HostedPayment,
    HostedSubscription,
    ProviderMetadata,
    ProviderPayment,
    ProviderRefund,
    ProviderSubscription,
)
from app.core.config.billing_contracts import (
    RAZORPAY_PAYMENT_STATUS_MAP,
)

# Shared commercial settings (timeouts, sweep bounds, subscription cycles)
# stay here; every credential/origin/host below is this vendor's own.
from app.core.config.billing_settings import billing_settings
from app.core.config.razorpay_settings import RazorpaySettings, razorpay_settings

_SECONDS_PER_DAY = 86_400
_NOTE_INTENT = "citeladder_intent_id"
_NOTE_ACCOUNT = "citeladder_account_ref"


class RazorpayBillingProvider:
    def __init__(
        self,
        *,
        settings: RazorpaySettings = razorpay_settings,
        client: httpx.AsyncClient,
    ) -> None:
        self.settings = settings
        self._client = client

    def _auth(self) -> httpx.BasicAuth:
        try:
            self.settings.require_provider_mode()
        except ValueError as exc:
            raise BillingProviderError("provider_not_configured") from exc
        key_id = self.settings.key_id.strip()
        secret = self.settings.key_secret.get_secret_value()
        if not key_id or not secret:
            raise BillingProviderError("provider_not_configured")
        return httpx.BasicAuth(key_id, secret)

    async def _request(
        self, method: str, path: str, *, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return await self._request_with_headers(
            method, path, payload=payload, headers=None
        )

    async def _request_with_headers(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None,
        headers: dict[str, str] | None,
    ) -> dict[str, Any]:
        try:
            response = await self._client.request(
                method,
                f"{self.settings.api_base_url.rstrip('/')}{path}",
                auth=self._auth(),
                json=payload,
                headers=headers,
                timeout=billing_settings.request_timeout_seconds,
                follow_redirects=False,
            )
        except httpx.TransportError as exc:
            raise BillingProviderError("provider_unavailable", retryable=True) from exc
        if 300 <= response.status_code < 400:
            raise BillingProviderError("provider_redirect_rejected")
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

    # --- response translation ---------------------------------------------
    def _subscription(self, data: dict[str, Any]) -> ProviderSubscription:
        external_id = data.get("id")
        status = data.get("status")
        if not isinstance(external_id, str) or not isinstance(status, str):
            raise BillingProviderError("provider_invalid_response")
        notes = _notes_map(data.get("notes"))
        return ProviderSubscription(
            external_subscription_id=external_id,
            status=status,
            current_start=_optional_int(data.get("current_start")),
            current_end=_optional_int(data.get("current_end")),
            updated_at=_optional_int(data.get("updated_at")) or 0,
            cancel_at_period_end=_provider_bool(data.get("cancel_at_cycle_end")),
            price_ref=_optional_str(data.get("plan_id")),
            intent_id=_optional_str(notes.get(_NOTE_INTENT)),
            account_ref=_optional_str(notes.get(_NOTE_ACCOUNT)),
            provider_mode=self.settings.require_provider_mode(),
            catalog_revision=_optional_str(notes.get("citeladder_catalog_revision")),
        )

    def _validated_checkout_url(self, value: object) -> str:
        if not isinstance(value, str) or len(value) > 2048:
            raise BillingProviderError("provider_invalid_checkout_url")
        parsed = urlsplit(value)
        if (
            parsed.scheme.lower() != "https"
            or not parsed.hostname
            or parsed.hostname.lower() not in self.settings.checkout_host_set()
            or parsed.username
            or parsed.password
        ):
            raise BillingProviderError("provider_invalid_checkout_url")
        return value

    def _hosted_subscription(
        self, data: dict[str, Any], *, expected_price_ref: str
    ) -> HostedSubscription:
        subscription = self._subscription(data)
        _require_price_ref(subscription, expected_price_ref)
        return HostedSubscription(
            external_subscription_id=subscription.external_subscription_id,
            checkout_url="",
            status=subscription.status,
            price_ref=subscription.price_ref,
        )

    def _payment(self, data: dict[str, Any]) -> ProviderPayment:
        external_id = data.get("id")
        status = data.get("status")
        amount = _optional_int(data.get("amount"))
        currency = data.get("currency")
        if (
            not isinstance(external_id, str)
            or not isinstance(status, str)
            or amount is None
            or not isinstance(currency, str)
        ):
            raise BillingProviderError("provider_invalid_response")
        if status not in RAZORPAY_PAYMENT_STATUS_MAP:
            raise BillingProviderError("provider_invalid_response")
        normalized_status = RAZORPAY_PAYMENT_STATUS_MAP[status]
        created_at = _optional_int(data.get("created_at"))
        # Read once and narrow the result: calling ``get`` twice gives the type
        # checker no way to tie the isinstance check to the value being used.
        raw_notes = data.get("notes")
        notes = raw_notes if isinstance(raw_notes, dict) else {}
        return ProviderPayment(
            external_payment_id=external_id,
            status=normalized_status,
            amount_minor=amount,
            currency=currency.upper(),
            updated_at=_optional_int(data.get("updated_at")) or created_at or 0,
            # The Payment entity guarantees created_at, not paid_at. Once its
            # authoritative status is captured/paid, creation is the only
            # provider timestamp available for the receipt's paid date.
            paid_at=(
                _optional_int(data.get("paid_at")) or created_at
                if normalized_status == "paid"
                else None
            ),
            provider_mode=self.settings.require_provider_mode(),
            external_invoice_id=_optional_str(data.get("invoice_id")),
            intent_id=_optional_str(notes.get(_NOTE_INTENT)),
            account_ref=_optional_str(notes.get(_NOTE_ACCOUNT)),
            payment_method=_optional_str(data.get("method")),
        )

    # --- protocol ---------------------------------------------------------
    async def create_base_subscription(
        self,
        *,
        price_ref: str,
        intent_id: str,
        account_ref: str,
        trial_days: int | None,
        metadata: ProviderMetadata,
    ) -> HostedSubscription:
        payload: dict[str, Any] = {
            "plan_id": price_ref,
            "total_count": billing_settings.subscription_total_cycles,
            "customer_notify": 1,
            "notes": metadata.as_notes(),
        }
        if trial_days:
            # Trial checkout is DEFERRED: the caller never supplies days in
            # PR1, and the free-period translation is the provider's
            # ``start_at`` when it does.
            payload["start_at"] = int(
                datetime.now(UTC).timestamp() + trial_days * _SECONDS_PER_DAY
            )
        data = await self._request("POST", "/subscriptions", payload=payload)
        return self._hosted_subscription(data, expected_price_ref=price_ref)

    async def create_addon_subscription(
        self,
        *,
        price_ref: str,
        quantity: int,
        intent_id: str,
        account_ref: str,
        metadata: ProviderMetadata,
    ) -> HostedSubscription:
        data = await self._request(
            "POST",
            "/subscriptions",
            payload={
                "plan_id": price_ref,
                "quantity": quantity,
                "total_count": billing_settings.subscription_total_cycles,
                "customer_notify": 1,
                "notes": metadata.as_notes(),
            },
        )
        return self._hosted_subscription(data, expected_price_ref=price_ref)

    async def fetch_subscription(
        self, external_subscription_id: str
    ) -> ProviderSubscription:
        subscription = self._subscription(
            await self._request("GET", f"/subscriptions/{external_subscription_id}")
        )
        invoices = await self._request(
            "GET", f"/invoices?subscription_id={external_subscription_id}"
        )
        from app.connectors.billing.subscription_evidence import (
            invoice_payment,
            matching_invoice,
        )

        invoice = matching_invoice(invoices, subscription)
        if invoice is None:
            return subscription
        payment = await self.fetch_payment(str(invoice["payment_id"]))
        return replace(
            subscription, payment=invoice_payment(invoice, payment, subscription)
        )

    async def find_subscription(
        self, intent_id: str, account_ref: str
    ) -> ProviderSubscription | None:
        data = await self._collection("/subscriptions")
        items = data.get("items")
        if not isinstance(items, list):
            raise BillingProviderError("provider_invalid_response")
        matches = [
            self._subscription(item)
            for item in items
            if isinstance(item, dict)
            and _notes_map(item.get("notes")).get(_NOTE_INTENT) == intent_id
            and _notes_map(item.get("notes")).get(_NOTE_ACCOUNT) == account_ref
        ]
        if len(matches) > 1:
            raise BillingProviderError("provider_subscription_ambiguous")
        return (
            await self.fetch_subscription(matches[0].external_subscription_id)
            if matches
            else None
        )

    async def _collection(self, path: str) -> dict[str, Any]:
        """Read bounded pages; a truncated search is not proof of absence."""
        items: list[dict[str, Any]] = []
        count = billing_settings.reconciliation_list_count
        separator = "&" if "?" in path else "?"
        for page in range(billing_settings.reconciliation_max_pages):
            data = await self._request(
                "GET", f"{path}{separator}count={count}&skip={page * count}"
            )
            batch = data.get("items")
            if not isinstance(batch, list) or any(
                not isinstance(item, dict) for item in batch
            ):
                raise BillingProviderError("provider_invalid_response")
            items.extend(batch)
            if len(batch) < count:
                return {"items": items}
        raise BillingProviderError("provider_collection_incomplete", retryable=True)

    async def fetch_plan(self, reference: str) -> dict[str, Any]:
        return await self._request("GET", f"/plans/{reference}")

    async def cancel_subscription(
        self, external_subscription_id: str, *, at_cycle_end: bool = True
    ) -> ProviderSubscription:
        return self._subscription(
            await self._request(
                "POST",
                f"/subscriptions/{external_subscription_id}/cancel",
                payload={"cancel_at_cycle_end": 1 if at_cycle_end else 0},
            )
        )

    async def create_one_time_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        intent_id: str,
        account_ref: str,
        metadata: ProviderMetadata,
    ) -> HostedPayment:
        data = await self._request(
            "POST",
            "/payment_links",
            payload={
                "amount": amount_minor,
                "currency": currency,
                "accept_partial": False,
                "reference_id": intent_id,
                "notes": metadata.as_notes(),
            },
        )
        payment = self._payment(data)
        if payment.amount_minor != amount_minor or payment.currency != currency.upper():
            raise BillingProviderError("provider_amount_mismatch")
        return HostedPayment(
            external_payment_id=payment.external_payment_id,
            checkout_url=self._validated_checkout_url(data.get("short_url")),
            status=payment.status,
            amount_minor=payment.amount_minor,
            currency=payment.currency,
        )

    async def fetch_payment(self, external_payment_id: str) -> ProviderPayment:
        if external_payment_id.startswith("plink_"):
            link = await self._request("GET", f"/payment_links/{external_payment_id}")
            payments = link.get("payments")
            if not isinstance(payments, list) or len(payments) != 1:
                raise BillingProviderError("provider_payment_unavailable")
            raw_payment = payments[0]
            if not isinstance(raw_payment, dict):
                raise BillingProviderError("provider_invalid_response")
            if "notes" not in raw_payment:
                raw_payment = {**raw_payment, "notes": link.get("notes")}
            return replace(
                self._payment(raw_payment),
                external_payment_link_id=external_payment_id,
            )
        return self._payment(
            await self._request("GET", f"/payments/{external_payment_id}")
        )

    async def refund_payment(
        self,
        external_payment_id: str,
        *,
        amount_minor: int,
        idempotency_key: str,
    ) -> ProviderRefund:
        data = await self._request_with_headers(
            "POST",
            f"/payments/{external_payment_id}/refund",
            payload={"amount": amount_minor},
            headers={"X-Refund-Idempotency": idempotency_key},
        )
        refund_id = data.get("id")
        payment_id = data.get("payment_id")
        status = data.get("status")
        amount = _optional_int(data.get("amount"))
        currency = data.get("currency")
        if (
            not isinstance(refund_id, str)
            or not refund_id
            or not isinstance(payment_id, str)
            or not payment_id
            or not isinstance(status, str)
            or not status
            or not isinstance(currency, str)
            or not currency
            or amount is None
            or amount != amount_minor
        ):
            raise BillingProviderError("provider_invalid_response")
        return ProviderRefund(
            external_refund_id=refund_id,
            external_payment_id=payment_id,
            status=status,
            amount_minor=amount,
            currency=currency.upper(),
            updated_at=_optional_int(data.get("created_at")) or 0,
        )


def _notes_map(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _require_price_ref(subscription: ProviderSubscription, expected: str) -> None:
    """Reject a hosted subscription whose echoed plan is not the one we named."""
    if subscription.price_ref != expected:
        raise BillingProviderError("provider_price_ref_mismatch")


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _optional_str(value: object) -> str:
    return value if isinstance(value, str) else ""


def _provider_bool(value: object) -> bool:
    return value is True or value == 1
