"""Export versioned rate cards and measured envelopes from their sole owner."""

import dataclasses

from app.core.config import costs


def costs_policy():
    return {
        "formula_version": costs.EXECUTION_COST_FORMULA_VERSION,
        "pricing_version": costs.PRICING_CATALOG_VERSION,
        "tokens_per_million": costs.TOKENS_PER_MILLION,
        "microusd_per_usd": costs.MICRO_USD_PER_USD,
        "estimate_input_chars_per_token": costs.ESTIMATE_INPUT_CHARS_PER_TOKEN,
        "estimate_search_calls": costs.ESTIMATE_SEARCH_CALLS,
        "unverified_pricing": dataclasses.asdict(
            costs._unverified_pricing(costs.PRICING_CATALOG_VERSION)
        ),
        "catalogs": {
            version: [
                {
                    "identity": dataclasses.asdict(identity),
                    "pricing": dataclasses.asdict(card),
                }
                for identity, card in catalog.items()
            ]
            for version, catalog in costs._ROUTE_PRICING_CATALOGS.items()
        },
        "expected_costs": [
            {
                "identity": dataclasses.asdict(identity),
                "cost": dataclasses.asdict(estimate),
            }
            for identity, estimate in costs._EXPECTED_COST_CATALOG.items()
        ],
    }
