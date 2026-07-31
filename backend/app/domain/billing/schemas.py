"""Safe public billing request/response contracts.

The v8 commercial catalog/quote/entitlement/usage DTOs land with the
commercial-surface commit; only the subscription-cancellation contract
survives the v6 removal.
"""

from __future__ import annotations

from pydantic import BaseModel


class CancelResponse(BaseModel):
    status: str
    cancel_at_period_end: bool
