from __future__ import annotations

import pytest

from app.connectors.app_model_transport import (
    chat_completions_url,
    normalize_app_model_url,
    resolve_app_model_target,
)


class _Resolver:
    def __init__(self, values: list[str]) -> None:
        self.values = values

    async def resolve(self, host: str, port: int) -> list[str]:
        assert host == "models.example.com"
        assert port == 443
        return self.values


@pytest.mark.parametrize(
    "value",
    [
        "http://models.example.com/v1",
        "https://user:secret@models.example.com/v1",
        "https://models.example.com:8443/v1",
        "https://models.example.com/v1?key=secret",
        "https://models.example.com/v1#secret",
    ],
)
def test_app_model_url_rejects_secret_or_unsafe_authority(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_app_model_url(value)


def test_app_model_url_normalizes_base_and_completion_path() -> None:
    assert normalize_app_model_url(" HTTPS://Models.Example.com/v1/ ") == (
        "https://models.example.com/v1"
    )
    assert chat_completions_url("https://models.example.com/v1") == (
        "https://models.example.com/v1/chat/completions"
    )


@pytest.mark.asyncio
async def test_app_model_target_pins_public_address() -> None:
    target = await resolve_app_model_target(
        "https://models.example.com/v1/chat/completions",
        resolver=_Resolver(["93.184.216.34"]),
    )
    assert target.host == "models.example.com"
    assert target.connect_ip == "93.184.216.34"
    assert target.url == "https://models.example.com/v1/chat/completions"


@pytest.mark.asyncio
async def test_app_model_target_rejects_private_or_mixed_dns() -> None:
    with pytest.raises(RuntimeError, match="not allowed"):
        await resolve_app_model_target(
            "https://models.example.com/v1",
            resolver=_Resolver(["93.184.216.34", "127.0.0.1"]),
        )
