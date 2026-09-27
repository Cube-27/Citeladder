"""Live hashes, locks and Action identities shared by the two stacks."""

import dataclasses
import itertools
import json
import uuid
from typing import Any

from app.analysis.comparison import frozen_comparison_key
from app.analysis.site_health.indexing import normalized_url_for_compare
from app.domain.prompts.locks import _PROJECT_NAMESPACE, _advisory_lock_key
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.source_pages.roster import project_roster


def _json(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _json(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {key: _json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json(item) for item in value]
    return json.loads(json.dumps(value, default=str))


def _uid(index: int) -> uuid.UUID:
    return uuid.UUID(f"00000000-0000-4000-8000-{index:012d}")


def opportunity_comparisons() -> list[dict[str, Any]]:
    config = {
        "brand_name": "Café 𐀀\u007f",
        "brand_aliases": ["Straße"],
        "owned_domains": ["brand.test"],
        "competitors": [],
        "country_code": "US",
        "language_code": "en",
        "benchmark_mode": "brand",
        "panel_hash": "panel",
        "engine_routes": {
            "engine": {"transport_provider": "provider", "transport_model": "model"}
        },
        "measurement_policy": {
            "retrieval_enabled": True,
            "max_output_tokens": 1024,
            "answer_instruction": "é",
        },
    }
    variants = [None, {}, config, dict(reversed(list(config.items())))]
    variants += [
        {key: value for key, value in config.items() if key != missing}
        for missing in config
    ]
    variants += [
        {**config, "engine_routes": {}},
        {**config, "measurement_policy": {"retrieval_enabled": "true"}},
    ]
    return [
        {
            "input": [value, engine, panel, engines],
            "output": frozen_comparison_key(
                value, engine=engine, include_panel=panel, include_engines=engines
            ),
        }
        for value, engine, panel, engines in itertools.product(
            variants, [None, "engine", "missing"], [True, False], [True, False]
        )
    ]


def opportunity_sources() -> list[dict[str, Any]]:
    """Values both stacks compute and compare (roster, hashes, lock key, page URL)."""
    cases: list[dict[str, Any]] = []

    def add(op, args, output):
        cases.append(
            {"input": {"op": op, "args": _json(args)}, "output": _json(output)}
        )

    configs: list[dict[str, Any]] = [
        {},
        {"brand_name": "Café", "brand_aliases": ["Straße", "b", "A"]},
        {"brand_name": None, "brand_aliases": None, "competitors": None},
        {
            "brand_name": "𐀀 Brand",
            "competitors": [
                {"name": "Zed", "aliases": ["z2", "Z1"]},
                {"name": "Acme", "aliases": []},
                {"name": "Acme"},
            ],
        },
    ]
    for config in configs:
        add("roster", [config], project_roster(config))
    for text in [
        "Best  shoes?",
        "  CAF\u00c9 Stra\u00dfe!! ",
        "\u00a0tab\tnl\n. ,;:",
        "\U00010000?",
        "",
        "\ufb01?!",
    ]:
        add("prompt_hash", [text], prompt_text_hash(text))
    for index in [0, 1, 7, 99]:
        add(
            "lock_key",
            [str(_uid(index))],
            str(_advisory_lock_key(_PROJECT_NAMESPACE, _uid(index))),
        )
    for url in [
        "https://BRAND.test:443/a///?utm_source=x&q=é#fragment",
        "http://brand.test:80",
        "https://brand.test:8443/a/b/",
        "HTTPS://Brand.Test/?b=2&a=1&fbclid=z",
        "relative/A",
        "  mailto:x@y  ",
        "",
    ]:
        add("url_compare", [url], normalized_url_for_compare(url))
    return cases
