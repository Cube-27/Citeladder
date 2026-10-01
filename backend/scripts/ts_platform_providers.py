"""Export provider connection policy without a second runtime authority."""

import dataclasses

from app.core.config import app_models, dataforseo, provider_catalog


def provider_policy(setting):
    return {
        "capacity": [
            {
                "logical_engine": engine,
                "transport_provider": transport,
                **dataclasses.asdict(policy),
            }
            for (
                engine,
                transport,
            ), policy in provider_catalog.ROUTE_CAPACITY_POLICIES.items()
        ],
        "routes": {
            engine: dataclasses.asdict(route)
            for engine, route in provider_catalog.MEASUREMENT_ROUTES.items()
        },
        "catalog": [
            dataclasses.asdict(row) for row in provider_catalog.PUBLIC_PROVIDER_CATALOG
        ],
        "transports": sorted(provider_catalog.ACTIVE_TRANSPORTS),
        "settings": {
            name: setting(name, provider_catalog.ProviderCatalogSettings)
            for name in (
                "openai_responses_url",
                "google_interactions_url",
                "anthropic_messages_url",
                "anthropic_version",
                "test_timeout_seconds",
                "test_max_output_tokens",
                "anthropic_max_uses",
                "byok_key_grace_days",
            )
        },
        "probe_prompt": provider_catalog.PROBE_PROMPT,
        "dataforseo": {
            "base_url": setting("base_url", dataforseo.DataForSeoSettings),
            "test_timeout_seconds": setting(
                "test_timeout_seconds", dataforseo.DataForSeoSettings
            ),
            "probe_path": dataforseo.PATH_USER_DATA,
            "success_status": dataforseo.STATUS_OK,
        },
        "app": {
            name.removeprefix("APP_MODEL_").lower(): sorted(value)
            if isinstance(value, frozenset)
            else value
            for name, value in vars(app_models).items()
            if name.startswith("APP_MODEL_")
        },
    }
