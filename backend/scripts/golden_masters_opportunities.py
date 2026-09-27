"""Live decision fixtures for Opportunity code whose Python owners remain.

The detectors, scoring, source mix, earned pages and exports moved to
TypeScript in migration PR 7a. What stays live is source classification, the
Action page key, placement comparison and page predicates, plus the values
both stacks compute and compare (``opportunity_sources``).
"""

import dataclasses
import itertools
import json
import uuid
from typing import Any

from app.analysis.comparison import frozen_comparison_key
from app.analysis.opportunities import actions, source_patterns
from app.analysis.opportunities import placement_outcome as placement
from app.analysis.opportunities.page_predicates import (
    links_to_owned,
    listed_in_headings,
)
from app.analysis.site_health.indexing import normalized_url_for_compare
from app.core.config import earned_actions
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


def opportunity_detectors() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    def add(op, args, output):
        cases.append(
            {"input": {"op": op, "args": _json(args)}, "output": _json(output)}
        )

    _source_cases(add)
    _placement_cases(add)
    _action_cases(add)
    _predicate_cases(add)
    return cases


def _source_cases(add) -> list[source_patterns.CitationEvidence]:
    citations = [
        source_patterns.CitationEvidence(
            domain=d,
            url=f"https://{d}/é",
            title=f"Source {i}",
            is_owned=False,
            matched_competitor=None,
        )
        for i, d in enumerate(
            [
                "g2.com",
                "reddit.com",
                "youtube.com",
                "google.co.uk",
                "google.evil.com",
                "www.example.org",
                "例子.com",
                "news.example",
                "twitter.com",
            ]
        )
    ]
    citations += [
        dataclasses.replace(citations[0], is_owned=True),
        dataclasses.replace(citations[1], matched_competitor="Rival"),
    ]
    for rows in [
        [],
        citations,
        list(reversed(citations)),
        [dataclasses.replace(citations[0], domain="", url="")],
    ]:
        add("source_pattern", [rows], source_patterns.summarize_source_pattern(rows))
    for domain, owned, competitor in itertools.product(
        [
            "",
            "google.com",
            "google.com.au",
            "google.evil.com",
            "sub.reddit.com",
            "WWW.G2.COM",
            "youtube.com",
        ],
        [True, False],
        [None, "Rival"],
    ):
        add(
            "source_class",
            [domain, owned, competitor],
            source_patterns.classify_source_domain(
                domain, is_owned=owned, matched_competitor=competitor
            ),
        )
    return citations


def _predicate_cases(add):
    for name, headings in [
        ("Best&Less", ("Best and Less",)),
        ("target", ("targeted",)),
        ("Duran Duran", ("Duran DuranDuran",)),
        ("Straße", ("STRASSE",)),
        ("é", ("é",)),
        ("𐀀", ("𐀀",)),
        ("", ()),
        ("Bonds", ("bond sand",)),
        ("Brand", ("\ufeffBrand",)),
    ]:
        add("headings", [name, headings], listed_in_headings(name, headings))
    for outbound, owned in [
        ((), ()),
        (("docs.brand.test",), ("www.brand.test",)),
        (("evilbrand.test",), ("brand.test",)),
    ]:
        add("links", [outbound, owned], links_to_owned(outbound, owned))


def _placement_cases(add):
    baseline = placement.PlacementReading(
        str(_uid(1)), "roster", 5000, "present", True, 3
    )
    for change in [
        "brand_listed",
        "discrepancy_resolved",
        "placement_restored",
        "source_resolved",
        "unknown",
    ]:
        expectation = placement.PlacementExpectation(
            change,
            "Brand",
            ("brand.test",),
            (
                earned_actions.DISCREPANCY_NOT_LISTED_AS_ENTRY,
                earned_actions.DISCREPANCY_OWNED_DOMAIN_MISSING,
            ),
        )
        for obs in [
            baseline,
            dataclasses.replace(baseline, brand_present=False),
            dataclasses.replace(baseline, roster_version="changed"),
            dataclasses.replace(baseline, extracted_chars=0),
            dataclasses.replace(baseline, brand_presence=None),
            dataclasses.replace(
                baseline, headings=("Brand",), outbound_domains=("brand.test",)
            ),
            dataclasses.replace(
                baseline, headings=("Rival",), outbound_domains=("rival.test",)
            ),
            dataclasses.replace(baseline, brand_match_count=2),
        ]:
            for before in [None, baseline]:
                add(
                    "placement",
                    [expectation, before, obs],
                    placement.evaluate_placement(
                        expectation=expectation, baseline=before, observation=obs
                    ),
                )


def _action_cases(add):
    for url in [
        "https://BRAND.test:443/a///?utm_source=x&q=é#fragment",
        "https://brand.test:99999/a",
        "https://brand.test/?b=2&a=1",
        "relative/A",
        "https://[::1]/a",
    ]:
        add("page_key", [url], actions.page_group_key(url))


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
