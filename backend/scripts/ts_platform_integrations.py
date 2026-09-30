"""Integration policy export; config modules remain its sole authority."""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import entitlements as entitlements_config
from app.core.config import integrations_contracts as integration_contracts
from app.core.config import integrations_datasets as integration_datasets
from app.core.config import integrations_transport as integration_transport
from app.core.config.entitlements import HISTORY_WINDOW_VALUES
from app.core.config.integrations_settings import (
    INTEGRATION_FREE_HISTORY_WINDOW_DAYS,
    INTEGRATION_HISTORY_WINDOW_DAYS,
    IntegrationSettings,
)
from app.core.config.oauth import OAuthSettings


def integration_policy(
    setting: Callable[[str, type[BaseSettings]], dict[str, Any]],
) -> dict[str, Any]:
    transport = {
        name: sorted(value) if isinstance(value, frozenset) else value
        for name, value in vars(integration_transport).items()
        if name.isupper() and isinstance(value, (str, int, dict, tuple, frozenset))
    }
    return {
        "transport": transport,
        "settings": {
            name: setting(name, IntegrationSettings)
            for name in IntegrationSettings.model_fields
        },
        "state_ttl_seconds": setting("state_ttl_seconds", OAuthSettings),
        "contracts": {
            name: value
            for name, value in vars(integration_contracts).items()
            if name.isupper() and isinstance(value, str)
        },
        "datasets": {
            name: dataclasses.asdict(template)
            for name, template in (
                integration_datasets.INTEGRATION_DATASET_TEMPLATES.items()
            )
        },
        "excluded_datasets": sorted(
            integration_datasets.INTEGRATION_SYNC_EXCLUDED_DATASETS
        ),
        "dimension_separator": integration_datasets.DIMENSION_KEY_SEPARATOR,
        "ga4_incompatible_markers": (
            integration_datasets.GA4_DIMENSION_INCOMPATIBLE_DETAIL_MARKERS
        ),
        "ga4_capability_key": (
            integration_datasets.GA4_ITEM_ATTRIBUTION_CAPABILITY_KEY
        ),
        "ga4_capability_version": (
            integration_datasets.GA4_ITEM_ATTRIBUTION_CAPABILITY_VERSION
        ),
        "ga4_fallback_granularity": (
            integration_datasets.GA4_ITEM_SOURCE_GRANULARITY_DEFAULT_CHANNEL_GROUP
        ),
        "importer_version": integration_contracts.INTEGRATION_IMPORTER_VERSION,
        "free_history_window_days": INTEGRATION_FREE_HISTORY_WINDOW_DAYS,
        "history_window_days": INTEGRATION_HISTORY_WINDOW_DAYS,
        "history_window_values": HISTORY_WINDOW_VALUES,
        "history_window_capability_key": entitlements_config.KEY_HISTORY_WINDOW,
    }
