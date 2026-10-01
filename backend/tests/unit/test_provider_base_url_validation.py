"""Operator policy still shared with retained provider readers."""

from app.core.config.provider_catalog import is_endpoint_approved


def test_only_operator_configured_credential_destination_is_approved() -> None:
    assert is_endpoint_approved("openai", "") is True
    assert is_endpoint_approved("openai", "https://api.openai.com/v1/responses") is True
    assert is_endpoint_approved("openai", "https://attacker.example/v1") is False
    assert is_endpoint_approved("openai", "http://127.0.0.1/v1") is False
    assert (
        is_endpoint_approved("openai", "  https://api.openai.com/v1/responses///  ")
        is True
    )
    assert is_endpoint_approved("unknown", "") is False
