"""Billing adapter factory kept patchable for focused tests."""

from app.connectors.billing.base import BillingProvider
from app.connectors.billing.http_client import shared_billing_client
from app.connectors.billing.razorpay import RazorpayBillingProvider


def get_billing_provider() -> BillingProvider:
    return RazorpayBillingProvider(client=shared_billing_client())
