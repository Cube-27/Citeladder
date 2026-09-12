"""Pure crawl-finalize checks over bounded persisted acquisition evidence.

The worker owns persistence; public checklist policy owns score membership.
"""

from __future__ import annotations

from urllib.parse import urljoin, urlsplit

from app.analysis.site_health.rules import RuleEvaluation, rule_for
from app.core.config import site_health_acquisition as site_health_config
from app.core.config.site_health_acquisition import (
    SITE_HEALTH_MAX_URL_CHARS,
)
from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_PARTIAL,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
)
from app.core.config.site_health_link_metrics import COVERAGE_STATE_COMPLETE
from app.core.config.site_health_measurement import public_check_membership
from app.core.config.site_health_rule_types import SiteHealthRule

# Evidence lists are bounded so a pathological crawl can never bloat a row.
_MAX_EVIDENCE_URLS = site_health_config.SITE_HEALTH_MAX_EVIDENCE_URLS


def _bounded_urls(urls: list[str]) -> list[str]:
    """The bounded, JSON-safe evidence form of a URL list."""
    return [str(url)[:SITE_HEALTH_MAX_URL_CHARS] for url in urls[:_MAX_EVIDENCE_URLS]]


def _catalog_rule(rule_id: str) -> SiteHealthRule:
    """The catalog entry for a finalize rule (a missing entry is a hard bug)."""
    rule = rule_for(rule_id)
    if rule is None:
        raise RuntimeError(f"crawl_finalize rule missing from catalog: {rule_id!r}")
    return rule


def _evaluation(rule: SiteHealthRule, outcome: str, evidence: dict) -> RuleEvaluation:
    """Build the finalize-pass ``RuleEvaluation`` for one catalog rule."""
    score_roles, _pillar = public_check_membership(rule.rule_id, "other")
    expected = bool(score_roles) and outcome != RULE_OUTCOME_NOT_APPLICABLE
    return RuleEvaluation(
        rule_id=rule.rule_id,
        rule_version=rule.rule_version,
        dimension=rule.dimension,
        category=rule.category,
        severity=rule.severity,
        finding_class=rule.finding_class,
        scope=rule.scope,
        weight=float(rule.weight),
        outcome=outcome,
        evidence=evidence,
        description=rule.description,
        remediation=rule.remediation,
        display_applicability=outcome != RULE_OUTCOME_NOT_APPLICABLE,
        score_applicability=expected,
        reason_code=str(evidence.get("reason") or ""),
        score_roles=score_roles,
    )


def _entity_set_evaluation(
    rule_id: str,
    *,
    total_count: int,
    checked_count: int,
    failing_urls: list[str],
) -> RuleEvaluation:
    rule = _catalog_rule(rule_id)
    total = max(0, int(total_count))
    checked = min(total, max(0, int(checked_count)))
    deduplicated_failures = list(dict.fromkeys(failing_urls))
    failures = min(checked, len(deduplicated_failures))
    if total == 0:
        return _evaluation(
            rule,
            RULE_OUTCOME_SATISFIED,
            {
                "total_count": 0,
                "checked_count": 0,
                "normalized_score": 1.0,
                "normalized_coverage": 1.0,
            },
        )
    if checked == 0:
        return _evaluation(
            rule,
            RULE_OUTCOME_UNKNOWN,
            {
                "reason": "insufficient_evidence",
                "total_count": total,
                "checked_count": 0,
            },
        )
    score = (checked - failures) / checked
    coverage = checked / total
    if checked < total and failures == 0:
        outcome = RULE_OUTCOME_UNKNOWN
    elif failures == 0:
        outcome = RULE_OUTCOME_SATISFIED
    elif failures == checked:
        outcome = RULE_OUTCOME_MISSING
    else:
        outcome = RULE_OUTCOME_PARTIAL
    return _evaluation(
        rule,
        outcome,
        {
            "total_count": total,
            "checked_count": checked,
            "failure_count": failures,
            "failing_urls": _bounded_urls(deduplicated_failures),
            "normalized_score": score,
            "normalized_coverage": coverage,
        },
    )


def evaluate_broken_internal_links(
    *, total_count: int, checked_count: int, broken_urls: list[str]
) -> RuleEvaluation:
    return _entity_set_evaluation(
        "technical.broken_internal_link",
        total_count=total_count,
        checked_count=checked_count,
        failing_urls=broken_urls,
    )


def evaluate_sitemap_url_unreachable(
    *, total_count: int, checked_count: int, unreachable_urls: list[str]
) -> RuleEvaluation:
    if total_count <= 0:
        return _evaluation(
            _catalog_rule("technical.sitemap_url_unreachable"),
            RULE_OUTCOME_NOT_APPLICABLE,
            {"reason": "no_sitemap"},
        )
    return _entity_set_evaluation(
        "technical.sitemap_url_unreachable",
        total_count=total_count,
        checked_count=checked_count,
        failing_urls=unreachable_urls,
    )


def evaluate_canonical_integrity(
    *,
    declarations: list[str],
    final_url: str,
    target_url: str,
    checked: bool,
    status_code: int | None,
    redirected: bool,
) -> RuleEvaluation:
    rule = _catalog_rule("technical.canonical_integrity")
    unique = list(
        dict.fromkeys(value.strip() for value in declarations if value.strip())
    )
    evidence = {
        "declarations": _bounded_urls(unique),
        "final_url": final_url,
        "target_url": target_url,
        "redirected": redirected,
    }
    if not unique:
        return _evaluation(
            rule,
            RULE_OUTCOME_NOT_APPLICABLE,
            {**evidence, "reason": "no_canonical"},
        )
    if len(unique) != 1:
        return _evaluation(
            rule,
            RULE_OUTCOME_MISSING,
            {**evidence, "reason": "conflicting_declarations"},
        )
    try:
        declared_origin = _canonical_origin(urljoin(final_url, unique[0]))
        final_origin = _canonical_origin(final_url)
    except ValueError:
        return _evaluation(
            rule,
            RULE_OUTCOME_MISSING,
            {**evidence, "reason": "invalid_canonical"},
        )
    if declared_origin != final_origin:
        return _evaluation(
            rule,
            RULE_OUTCOME_MISSING,
            {**evidence, "reason": "cross_origin_canonical"},
        )
    if not checked or status_code is None:
        return _evaluation(
            rule,
            RULE_OUTCOME_UNKNOWN,
            {**evidence, "reason": "insufficient_evidence"},
        )
    healthy = status_code < 400
    return _evaluation(
        rule,
        RULE_OUTCOME_SATISFIED if healthy else RULE_OUTCOME_MISSING,
        {**evidence, "status_code": status_code},
    )


def _canonical_origin(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url)
    scheme = parts.scheme.casefold()
    if scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("Invalid canonical origin")
    port = parts.port
    return (
        scheme,
        parts.hostname.casefold(),
        port if port is not None else (443 if scheme == "https" else 80),
    )


def evaluate_sitemap_orphan(
    *, sitemap_url_count: int, orphan_urls: list[str], coverage_state: str
) -> RuleEvaluation:
    """``technical.sitemap_orphan`` for the whole crawl (root-anchored).

    ``sitemap_url_count`` is the number of sitemap-sourced URLs the crawl
    admitted; ``orphan_urls`` the bounded subset never observed through
    links. Unknown when crawl coverage is incomplete. Not
    applicable when the crawl ingested no sitemap URLs (Free sample crawls
    never ingest sitemaps; a site without a sitemap has nothing to orphan).
    """
    rule = _catalog_rule("technical.sitemap_orphan")
    if coverage_state != COVERAGE_STATE_COMPLETE:
        return _evaluation(
            rule,
            RULE_OUTCOME_UNKNOWN,
            {"reason": "coverage_not_complete", "coverage_state": coverage_state},
        )
    if sitemap_url_count <= 0:
        return _evaluation(rule, RULE_OUTCOME_NOT_APPLICABLE, {"reason": "no_sitemap"})
    outcome = RULE_OUTCOME_MISSING if orphan_urls else RULE_OUTCOME_SATISFIED
    return _evaluation(
        rule,
        outcome,
        {
            "sitemap_url_count": int(sitemap_url_count),
            "orphan_count": len(orphan_urls),
            "orphan_urls": _bounded_urls(orphan_urls),
        },
    )


def evaluate_hreflang_conflict(
    *,
    alternate_count: int,
    checked_count: int,
    unchecked_count: int,
    missing_return_tags: list[str],
    rate_limited_count: int = 0,
) -> RuleEvaluation:
    """``technical.hreflang_conflict`` for ONE analysis's hreflang cluster.

    ``alternate_count`` is the page's declared hreflang alternates;
    ``checked_count`` how many of those targets were themselves analyzed in
    this crawl (only they can be verified); ``unchecked_count`` the rest;
    ``missing_return_tags`` the bounded verified failures (alternates whose
    target page does not link back). Not applicable when the page declares no
    hreflang alternates. Unknown when none of its alternates were analyzed
    (nothing could be verified — absence fabricates nothing).
    """
    rule = _catalog_rule("technical.hreflang_conflict")
    if alternate_count <= 0:
        return _evaluation(rule, RULE_OUTCOME_NOT_APPLICABLE, {"reason": "no_hreflang"})
    if rate_limited_count > 0 and not missing_return_tags:
        return _evaluation(
            rule,
            RULE_OUTCOME_UNKNOWN,
            {
                "reason": "rate_limited_alternates",
                "alternate_count": int(alternate_count),
                "checked_count": int(checked_count),
                "unchecked_count": int(unchecked_count),
                "rate_limited_count": int(rate_limited_count),
            },
        )
    if checked_count <= 0:
        return _evaluation(
            rule,
            RULE_OUTCOME_UNKNOWN,
            {
                "reason": "no_checkable_alternates",
                "alternate_count": int(alternate_count),
                "unchecked_count": int(unchecked_count),
            },
        )
    outcome = RULE_OUTCOME_MISSING if missing_return_tags else RULE_OUTCOME_SATISFIED
    return _evaluation(
        rule,
        outcome,
        {
            "alternate_count": int(alternate_count),
            "checked_count": int(checked_count),
            "unchecked_count": int(unchecked_count),
            "missing_return_tags": _bounded_urls(missing_return_tags),
        },
    )
