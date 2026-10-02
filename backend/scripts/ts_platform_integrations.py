"""Shared integration persistence defaults and entitlement identity."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import integrations_contracts
from app.core.config.entitlements import HISTORY_WINDOW_VALUES, KEY_HISTORY_WINDOW
from app.core.config.integrations_settings import IntegrationSettings


def integration_policy(
    setting: Callable[[str, type[BaseSettings]], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "settings": {
            "sync_max_attempts": setting("sync_max_attempts", IntegrationSettings)
        },
        "contracts": {
            name: value
            for name, value in vars(integrations_contracts).items()
            if name.isupper() and isinstance(value, str)
        },
        "importer_version": integrations_contracts.INTEGRATION_IMPORTER_VERSION,
        "history_window_values": HISTORY_WINDOW_VALUES,
        "history_window_capability_key": KEY_HISTORY_WINDOW,
    }
