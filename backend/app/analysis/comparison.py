"""Frozen measurement identity shared by persisted readers and decline analysis."""

from __future__ import annotations

import json
from hashlib import sha256

from app.core.config.audits import MEASUREMENT_POLICY_KEY


def frozen_comparison_key(
    configuration: dict | None,
    *,
    engine: str | None = None,
    include_panel: bool = True,
    include_engines: bool = True,
) -> str | None:
    """Unknown identity cannot compare equal, even to another unknown identity.

    Operational credentials, timeouts and random seeds do not define the
    measurement. Prompt text hashes and exact routes do; never use live config.
    """
    config = configuration or {}
    required = (
        "brand_name",
        "brand_aliases",
        "owned_domains",
        "competitors",
        "country_code",
        "language_code",
        "benchmark_mode",
        "engine_routes",
        MEASUREMENT_POLICY_KEY,
    )
    inputs = _identity_inputs(config, required, engine, include_panel)
    if inputs is None:
        return None
    chosen, policy, policy_fields = inputs
    identity = {
        key: config[key]
        for key in required
        if key not in {"engine_routes", MEASUREMENT_POLICY_KEY}
    }
    identity.update(
        panel=config.get("panel_hash") if include_panel else None,
        routes=_route_identity(chosen) if include_engines else None,
        measurement_policy={key: policy[key] for key in policy_fields},
        audit_scope=config.get("audit_scope"),
        repetitions=config.get("repetitions"),
        system_instruction=config.get("system_instruction"),
        products_services=config.get("products_services"),
        unintended_domains=config.get("unintended_domains"),
    )
    return sha256(
        json.dumps(identity, sort_keys=True, default=str).encode()
    ).hexdigest()


def _chosen_routes(config, engine):
    """The routes this identity covers: one engine's, or every engine's.

    Returns None when any of them is missing — a route that was not recorded
    cannot be shown to match another one.
    """
    routes = config.get("engine_routes") or {}
    chosen: dict[str, dict] = {engine: routes.get(engine) or {}} if engine else routes
    if not chosen or any(not route for route in chosen.values()):
        return None
    return chosen


def _identity_inputs(config, required, engine, include_panel):
    if any(key not in config for key in required):
        return None
    if include_panel and not config.get("panel_hash"):
        return None
    chosen = _chosen_routes(config, engine)
    if chosen is None:
        return None
    policy = config[MEASUREMENT_POLICY_KEY]
    policy_fields = ("retrieval_enabled", "max_output_tokens", "answer_instruction")
    if not _valid_policy(policy, policy_fields) or not _valid_routes(chosen):
        return None
    return chosen, policy, policy_fields


def _route_identity(chosen):
    return {
        name: {
            key: route.get(key)
            for key in ("transport_provider", "transport_model", "retrieval_enabled")
        }
        for name, route in chosen.items()
    }


def _valid_policy(policy, fields):
    return (
        isinstance(policy, dict)
        and all(key in policy for key in fields)
        and isinstance(policy.get("retrieval_enabled"), bool)
    )


def _valid_routes(routes):
    # Provider and model only. `_route_identity` also reads `retrieval_enabled`
    # from each route, but the frozen plan records that setting once on
    # `measurement_policy` (which `_valid_policy` requires to be a bool) and
    # never per route — so it hashes as `None` for every route of every run
    # alike, and requiring it here would reject every real configuration.
    return all(
        route.get("transport_provider") and route.get("transport_model")
        for route in routes.values()
    )
