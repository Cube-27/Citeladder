"""Pure deterministic order-referrer attribution link behavior."""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.domain.analytics.classification import RuleMatch
from app.domain.attribution import link as link_module
from app.domain.attribution.link import _link_values
from app.models.commerce import OrderFact


def _order(**keys: str) -> OrderFact:
    return OrderFact(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        connection_id=uuid.uuid4(),
        provider="shopify",
        order_ref_hash="a" * 64,
        resync_seq=0,
        currency="USD",
        total_amount=Decimal("25.00"),
        line_items=[],
        attribution_keys=keys,
        source_artifact_id=uuid.uuid4(),
    )


def test_referrer_priority_beats_utm() -> None:
    values = _link_values(
        _order(
            referrer_url="https://perplexity.ai/search?q=safe",
            utm_source="chatgpt.com",
        )
    )
    assert values is not None
    assert values["ai_source"] == "perplexity"
    assert values["match_signal"] == "referrer"
    assert values["confidence"] == "exact"


def test_utm_fallback_and_unmatched_order() -> None:
    values = _link_values(_order(utm_source="claude"))
    assert values is not None
    assert values["ai_source"] == "claude"
    assert values["match_signal"] == "utm"
    assert _link_values(_order(referrer_url="https://example.com/path")) is None


def test_classifier_confidence_and_rule_are_propagated(monkeypatch) -> None:
    monkeypatch.setattr(
        link_module,
        "classify_referral_signals",
        lambda **_kwargs: RuleMatch(
            ai_source="chatgpt",
            logical_engine="chatgpt",
            matched_rule_id="future-heuristic",
            match_signal="utm",
            confidence="heuristic",
        ),
    )
    values = _link_values(_order(utm_source="future"))
    assert values is not None
    assert values["matched_rule_id"] == "future-heuristic"
    assert values["confidence"] == "heuristic"


def test_linking_uses_only_sanitized_order_signals() -> None:
    # No session id/user-agent/raw payload is accepted by the link helper.
    values = _link_values(
        _order(source_name="ChatGPT", landing_url="https://shop.test")
    )
    assert values is None
