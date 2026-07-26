"""Provider-neutral billing DTOs, errors, and protocol."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class BillingProviderError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class HostedSubscription:
    external_subscription_id: str
    checkout_url: str
    status: str


@dataclass(frozen=True, slots=True)
class ProviderSubscription:
    external_subscription_id: str
    status: str
    current_start: int | None
    current_end: int | None
    updated_at: int
    cancel_at_period_end: bool


class BillingProvider(Protocol):
    async def create_subscription(
        self, *, plan_id: str, attempt_id: str, billing_account_id: str
    ) -> HostedSubscription: ...

    async def fetch_subscription(
        self, external_subscription_id: str
    ) -> ProviderSubscription: ...

    async def cancel_subscription(
        self, external_subscription_id: str, *, at_cycle_end: bool
    ) -> ProviderSubscription: ...
