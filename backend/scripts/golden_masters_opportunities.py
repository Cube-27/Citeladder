"""Live decision fixtures for the PR7 opportunity foundation retained in Python."""

import dataclasses
import itertools
import json
import uuid
from typing import Any

from app.analysis.comparison import frozen_comparison_key
from app.analysis.opportunities import (
    actions,
    detectors,
    earned_pages,
    exports,
    scoring,
    source_mix,
    source_patterns,
)
from app.analysis.opportunities import placement_outcome as placement
from app.analysis.opportunities.earned_page_evidence import (
    EarnedPageEvidence,
    PageEntityEvidence,
    PriorPageEvidence,
    SourcePageEvidence,
)
from app.analysis.opportunities.page_predicates import (
    links_to_owned,
    listed_in_headings,
)
from app.core.config import earned_actions, opportunities, source_pages


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

    _scoring_cases(add)
    citations = _source_cases(add)
    _visibility_cases(add, citations)
    _site_cases(add)
    _earned_cases(add)
    _placement_cases(add)
    _action_cases(add)
    _predicate_cases(add)
    _export_cases(add)
    return cases


def _scoring_cases(add):
    for intent in [None, "", "  BUY ", *opportunities.INTENT_VALUE_WEIGHTS, "unknown"]:
        add("intent", [intent], scoring.value_factor_for_intent(intent))
    for stage, intent, legacy in itertools.product(
        [None, "", *opportunities.BUYER_STAGE_VALUE_WEIGHTS],
        [None, "", *opportunities.PROMPT_INTENT_VALUE_WEIGHTS],
        ["buy", "unknown"],
    ):
        add(
            "prompt_value",
            [stage, intent, legacy],
            scoring.value_factor_for_prompt(stage, intent, legacy),
        )
    for count, rate in itertools.product([-2, 0, 1, 5, 999], [-1, 0, 0.5, 1, 2]):
        add(
            "gap",
            [count, rate, 1.2],
            scoring.gap_factor_visibility(
                competitor_count=count,
                owned_citation_rate=rate,
                recommendation_strength=1.2,
            ),
        )
    for count in [-1, 0, 1, 2, 99]:
        add(
            "competitor_factor", [count], scoring.page_competitor_presence_factor(count)
        )
        for eligible in [0, 1, 3, 20]:
            add(
                "recurrence",
                [count, eligible],
                scoring.page_recurrence_factor(
                    answer_count=count, eligible_answers=eligible
                ),
            )
    for severity, value in itertools.product(
        [*opportunities.SEVERITY_WEIGHTS, "unknown"], [0, 1, 1.125, 2.675]
    ):
        add(
            "priority",
            [severity, value, 1.1],
            scoring.priority_score(
                severity=severity, value_factor=value, gap_factor=1.1
            ),
        )
    for values in [
        [],
        [{"state": key} for key in opportunities.RECOMMENDATION_STRENGTH_FACTORS],
        [{"state": "unknown"}],
    ]:
        add("recommendation", [values], scoring.recommendation_strength_factor(values))


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


def _visibility_cases(add, citations: list[source_patterns.CitationEvidence]):
    snapshot = detectors.PromptSnapshotEvidence(
        0, _uid(2), "Which café?", "Theme", "buy", "decision", "comparison", _uid(3)
    )
    rows: tuple[detectors.AnalysisEvidence, ...]
    for mentioned, owned, rivals, domains in itertools.product(
        [False, True], [0, 1], [(), ("Rival", "", "Rival")], [(), ("brand.test",)]
    ):
        rows = (
            detectors.AnalysisEvidence(
                _uid(4),
                0,
                "engine",
                owned,
                mentioned,
                rivals,
                tuple(citations),
                _uid(5),
                ({"entity_kind": "competitor", "state": "recommended"},),
            ),
        )
        evidence = detectors.VisibilityEvidence(_uid(1), rows, (snapshot,), domains)
        add(
            "brand_absent",
            [evidence],
            detectors.detect_brand_absent_high_value_prompt(evidence),
        )
        add(
            "owned_not_cited",
            [evidence],
            detectors.detect_owned_page_not_cited(evidence),
        )
    for snapshots in [(), (dataclasses.replace(snapshot, prompt_id=None),)]:
        rows = (
            detectors.AnalysisEvidence(_uid(9), 2, "", 0, False, ("𐀀", "é")),
            detectors.AnalysisEvidence(_uid(8), 0, "engine", 0, False, ("Rival",)),
        )
        evidence = detectors.VisibilityEvidence(
            _uid(1), rows, snapshots, ("brand.test",)
        )
        add(
            "brand_absent",
            [evidence],
            detectors.detect_brand_absent_high_value_prompt(evidence),
        )
    for gap in [set(), {0}, {1}]:
        for sources in [(), tuple(citations), (citations[3],)]:
            rows = tuple(
                detectors.AnalysisEvidence(
                    _uid(20 + i),
                    0,
                    "engine",
                    0,
                    False,
                    ("Rival",),
                    sources,
                    _uid(30 + i),
                )
                for i in range(4)
            )
            add(
                "source_mix",
                [rows, (snapshot,), sorted(gap)],
                source_mix.build_source_projection(
                    analyses=rows, snapshots=(snapshot,), gap_prompt_indices=gap
                ),
            )


def _site_cases(add):
    for mapped in [*opportunities.SITE_ISSUE_TO_OPPORTUNITY_RULE_ID, "unmapped"]:
        for finding in ["defect", "observation"]:
            issue = detectors.SiteIssueEvidence(
                _uid(1), mapped, "high", "technical", _uid(2), None, finding
            )
            evidence = detectors.SiteEvidence(
                _uid(3),
                (issue,),
                (detectors.SiteUrlEvidence(_uid(2), "https://brand.test/a"),),
                {"state": "partial"},
                ("Missing pages",),
            )
            add("site", [evidence], detectors.detect_site_issue_opportunities(evidence))
    for rule, choices in opportunities.SITE_ISSUE_ATOM_PRESENTATION.items():
        for atoms in [[], *choices]:
            issue = detectors.SiteIssueEvidence(
                _uid(1),
                rule,
                "high",
                "technical",
                _uid(2),
                {"atoms": [{"name": name, "outcome": "missing"} for name in atoms]},
            )
            evidence = detectors.SiteEvidence(
                _uid(3),
                (issue,),
                (detectors.SiteUrlEvidence(_uid(2), "https://brand.test/a"),),
                {},
                (),
            )
            add("site", [evidence], detectors.detect_site_issue_opportunities(evidence))


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


def _export_cases(add):
    variants: list[list[dict[str, Any]]] = [
        [],
        [
            {
                "title": '\t=HYPERLINK("x")',
                "remediation": "a|b\r\nc\\d",
                "priority_score": -2.0,
                "target": "é𐀀",
                "rule_version": True,
            }
        ],
        [{"title": "  +formula", "target": None, "priority_score": 30.0}],
    ]
    for rows in variants:
        add("csv", [rows], exports.rows_to_csv(rows))
        add("markdown", [rows], exports.rows_to_markdown(rows))


def _earned_cases(add):
    brand = PageEntityEvidence("brand", "Best & Less", "not_detected", "exact", 0)
    competitor = PageEntityEvidence(
        "competitor", "Rival", "present", "exact", 2, ("Rival is listed.",)
    )
    page = SourcePageEvidence(
        "hash",
        "https://publisher.test/list",
        "publisher.test",
        "listicle",
        "heading",
        "inspected",
        None,
        str(_uid(1)),
        5000,
        True,
        "Best tools",
        ("Rival",),
        ("rival.test",),
        "current",
        (brand, competitor),
        None,
        True,
        answer_count=3,
        prompt_indices=(0,),
        analysis_ids=(str(_uid(2)),),
        recurrence_count=3,
    )
    variants = [page]
    variants.extend(
        dataclasses.replace(page, answer_count=answer, recurrence_count=recurrence)
        for answer, recurrence in itertools.product([0, 1, 2, 3], repeat=2)
    )
    for headings, domains in itertools.product(
        [(), ("Rival",), ("Best and Less",)],
        [(), ("rival.test",), ("docs.brand.test",)],
    ):
        variants.append(
            dataclasses.replace(
                page,
                entities=(dataclasses.replace(brand, presence="present"), competitor),
                headings=headings,
                outbound_domains=domains,
            )
        )
    for presence in ["present", "ambiguous", "partial", "not_detected"]:
        for prior in [None, PriorPageEvidence(str(_uid(3)), True, 5, (), "old")]:
            variants.append(
                dataclasses.replace(
                    page,
                    entities=(
                        dataclasses.replace(brand, presence=presence),
                        competitor,
                    ),
                    prior=prior,
                )
            )
    for state in [
        source_pages.INSPECTION_NOT_INSPECTED,
        source_pages.INSPECTION_QUEUED,
        source_pages.INSPECTION_FAILED,
        "blocked",
        "inspected",
    ]:
        for requested in [False, True]:
            variants.append(
                dataclasses.replace(
                    page,
                    inspection_state=state,
                    requested=requested,
                    sufficient_coverage=False,
                )
            )
    field_variants: dict[str, list[Any]] = {
        "answer_count": [0, 1, 2, 4],
        "recurrence_count": [0, 1, 2, 4],
        "snapshot_id": [None],
        "roster_current": [False],
        "entities": [()],
        "page_format": ["unresolved", "article"],
        "headings": [(), ("Best and Less",)],
        "outbound_domains": [(), ("brand.test",)],
        "themes": [("theme",) * 20],
    }
    for field, values in field_variants.items():
        variants.extend(dataclasses.replace(page, **{field: value}) for value in values)
    variants += [
        dataclasses.replace(
            page,
            entities=(
                dataclasses.replace(
                    brand, presence="present", passages=("Brand passage",) * 10
                ),
                competitor,
            ),
            answer_competitors=("other",) * 20,
        )
    ]
    for item in variants:
        evidence = EarnedPageEvidence((item,), ("brand.test",), 8, 1, 5)
        add("qualification", [item], earned_pages.qualification(item))
        add(
            "earned",
            [evidence],
            earned_pages.detect_earned_page_opportunities(evidence),
        )


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
    members = [
        actions.ActionMember(
            _uid(i + 1),
            rule.rule_id,
            "url:https://brand.test/a/",
            "https://brand.test/a/",
            None,
            "theme",
            None,
            rule.title,
            50 + i,
            (str(i),),
        )
        for i, rule in enumerate(opportunities.OPPORTUNITY_RULES)
    ]
    for rows in [[], members, list(reversed(members))]:
        add(
            "groups",
            [rows, ["ai_visibility", "site_health"]],
            actions.group_members(
                rows, available_families=frozenset({"ai_visibility", "site_health"})
            ),
        )
    for key, url, prompt, theme in [
        ("product:x", None, None, ""),
        ("category:x", None, None, ""),
        ("prompt-index:x:1", None, None, ""),
        ("demand:x", None, None, " STRASSE Straße "),
        ("prompt:x", None, _uid(2), ""),
        ("other", None, None, ""),
    ]:
        member = dataclasses.replace(
            members[0],
            target_key=key,
            target_url=url,
            target_prompt_id=prompt,
            target_theme=theme,
        )
        add("target", [member], actions.target_for(member))
    for url in [
        "https://BRAND.test:443/a///?utm_source=x&q=é#fragment",
        "https://brand.test:99999/a",
        "https://brand.test/?b=2&a=1",
        "relative/A",
        "https://[::1]/a",
    ]:
        add("page_key", [url], actions.page_group_key(url))
