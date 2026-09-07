from __future__ import annotations

import uuid

from app.analysis.opportunities.detectors import (
    SiteEvidence,
    SiteIssueEvidence,
    SiteUrlEvidence,
    detect_site_issue_opportunities,
)
from app.domain.opportunities.recompute import _score_hits


def _entity_issue(*missing: str) -> SiteIssueEvidence:
    return SiteIssueEvidence(
        issue_id=uuid.uuid4(),
        rule_id="aeo.entity_value_proposition",
        severity="low",
        category="content",
        site_url_id=uuid.uuid4(),
        evidence={"atoms": [{"name": name, "outcome": "missing"} for name in missing]},
    )


def _site_evidence(issue: SiteIssueEvidence) -> SiteEvidence:
    return SiteEvidence(
        crawl_id=uuid.uuid4(),
        issues=(issue,),
        urls=(SiteUrlEvidence(issue.site_url_id, "https://example.test/"),),
        coverage={},
        limitations=(),
    )


def test_entity_identity_opportunity_names_the_failed_atom() -> None:
    hit = detect_site_issue_opportunities(
        _site_evidence(_entity_issue("entity_identity"))
    )[0]

    assert hit.title_override == "Name the organization in the page introduction"
    assert hit.remediation_override is not None


def test_value_proposition_opportunity_names_the_failed_atom() -> None:
    hit = detect_site_issue_opportunities(
        _site_evidence(_entity_issue("value_proposition"))
    )[0]

    assert hit.title_override == "State what the organization provides"
    assert "provides" in str(hit.remediation_override).casefold()


def test_entity_opportunity_combines_known_missing_atoms() -> None:
    hit = detect_site_issue_opportunities(
        _site_evidence(_entity_issue("entity_identity", "value_proposition"))
    )[0]

    assert hit.title_override == "Identify the organization and what it provides"


def test_entity_contact_opportunity_names_the_failed_atom() -> None:
    hit = detect_site_issue_opportunities(
        _site_evidence(_entity_issue("contact_path"))
    )[0]

    assert hit.title_override == "Provide a usable contact path"
    assert "contact" in str(hit.remediation_override).casefold()


def test_entity_opportunity_uses_general_copy_for_legacy_evidence() -> None:
    issue = _entity_issue()
    issue = SiteIssueEvidence(
        issue_id=issue.issue_id,
        rule_id=issue.rule_id,
        severity=issue.severity,
        category=issue.category,
        site_url_id=issue.site_url_id,
        evidence={"legacy_reason": "content_structure_incomplete"},
    )

    hit = detect_site_issue_opportunities(_site_evidence(issue))[0]

    assert hit.title_override is None
    assert hit.remediation_override is None


def test_duplicate_site_gap_keeps_entity_guidance_and_provenance() -> None:
    site_url_id = uuid.uuid4()
    answer_issue = SiteIssueEvidence(
        issue_id=uuid.UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"),
        rule_id="aeo.answer_first",
        severity="low",
        category="content",
        site_url_id=site_url_id,
        evidence={"reason": "answer_content_missing"},
    )
    entity_issue = SiteIssueEvidence(
        issue_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        rule_id="aeo.entity_value_proposition",
        severity="low",
        category="content",
        site_url_id=site_url_id,
        evidence={"atoms": [{"name": "value_proposition", "outcome": "missing"}]},
    )
    evidence = SiteEvidence(
        crawl_id=uuid.uuid4(),
        issues=(answer_issue, entity_issue),
        urls=(SiteUrlEvidence(site_url_id, "https://example.test/about"),),
        coverage={},
        limitations=(),
    )

    scored = _score_hits(detect_site_issue_opportunities(evidence))

    assert len(scored) == 1
    hit, _score = scored[0]
    assert hit.title_override == "State what the organization provides"
    assert set(hit.source_issue_ids) == {
        str(answer_issue.issue_id),
        str(entity_issue.issue_id),
    }
