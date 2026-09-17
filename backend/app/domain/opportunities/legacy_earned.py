"""Carrying a domain-level decision forward to the page that replaced it.

The retiring detector keyed on ``earned-source:{class}:{domain}``. Its
replacement keys on one page, so the two key spaces do not meet and
``_write_recompute``'s exact ``(rule_id, target_key)`` match finds nothing.
Left alone, every human decision on a publisher would be discarded in silence
at the cutover -- which is the same defect the page key exists to fix.

The carry is deliberately narrow, because a domain-level decision does not
distribute across pages. Marking a publisher ``in_progress`` because someone
is contacting the author of one article says nothing about five other
articles on that domain, and dismissing one vague domain suggestion does not
dismiss every future inclusion on that publisher.

So a status moves only where there is an UNAMBIGUOUS successor: the same
registrable domain resolving to exactly one qualified page, with an action
intent matching the one the legacy rule expressed. Everywhere else the legacy
decision is attached as context and the new page task starts open.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.analysis.opportunities.detectors import DetectorHit
from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_SOURCE_RECURS,
)
from app.core.config.opportunities import STATUS_OPEN
from app.models.opportunity import Opportunity

__all__ = ["LegacyBridge", "bridge_legacy_earned"]

# The retiring rule proposed one thing: get listed on this publisher. Only
# the page rule with that same intent can inherit its decision. A correction,
# a defence or a research prompt are different done-states and start fresh.
_INHERITING_RULE = RULE_EARNED_PAGE_ACQUIRE

# Every rule that qualifies a page for action. All of them count towards
# whether a domain resolved to ONE page, even though only the inheriting rule
# can take the decision: a publisher with one page to join and another to
# correct did not resolve unambiguously, and treating it as if it had would
# move a decision that was never made about either page. Research is absent
# because an unresolved source is not a qualified page.
_QUALIFIED_RULES = frozenset(
    {RULE_EARNED_PAGE_ACQUIRE, RULE_EARNED_PAGE_CORRECT, RULE_EARNED_PAGE_DEFEND}
)


@dataclass(frozen=True, slots=True)
class LegacyBridge:
    """The retired domain decision standing behind one page task."""

    legacy_opportunity_id: str
    legacy_target_key: str
    legacy_status: str
    # False when the domain resolved to more than one page: the decision is
    # shown as context and the new task starts with its own status.
    carried: bool

    def as_evidence(self) -> dict:
        return {
            "legacy_opportunity_id": self.legacy_opportunity_id,
            "legacy_target_key": self.legacy_target_key,
            "legacy_status": self.legacy_status,
            "status_carried": self.carried,
        }


def _legacy_domain(target_key: str) -> str:
    """The domain out of ``earned-source:{source_class}:{domain}``.

    Split from the right, because a source class never contains a colon but a
    historical key could have been written with one.
    """
    return target_key.rsplit(":", 1)[-1].strip().casefold()


def _hit_domain(hit: DetectorHit) -> str:
    handoff = hit.evidence.get("content_handoff") or {}
    return str(handoff.get("canonical_domain") or "").strip().casefold()


def _qualified_by_domain(
    scored: list[tuple[DetectorHit, float]],
) -> dict[str, list[DetectorHit]]:
    """Qualified page hits grouped by the domain they sit on."""
    grouped: dict[str, list[DetectorHit]] = {}
    for hit, _score in scored:
        if hit.rule_id not in _QUALIFIED_RULES:
            continue
        domain = _hit_domain(hit)
        if domain:
            grouped.setdefault(domain, []).append(hit)
    return grouped


def bridge_legacy_earned(
    *,
    live_rows: list[Opportunity],
    scored: list[tuple[DetectorHit, float]],
) -> dict[str, LegacyBridge]:
    """Map each inheriting page task to the legacy row it supersedes.

    Keyed by the new hit's ``target_key``. A legacy row with no page on its
    domain is absent, and is superseded with no successor exactly as any
    retired row is -- readable in history, generating nothing.
    """
    legacy = {
        _legacy_domain(row.target_key): row
        for row in live_rows
        if row.rule_id == RULE_EARNED_SOURCE_RECURS
    }
    if not legacy:
        return {}
    by_domain = _qualified_by_domain(scored)
    bridges: dict[str, LegacyBridge] = {}
    for domain, row in legacy.items():
        qualified = by_domain.get(domain, [])
        inheriting = [hit for hit in qualified if hit.rule_id == _INHERITING_RULE]
        # One qualified page on the domain, and it is the one with a matching
        # intent: the decision is unambiguous and moves. Anything else and it
        # would distribute a single domain-level judgement across pages that
        # judgement was never about.
        carried = len(qualified) == 1 and row.status != STATUS_OPEN
        for hit in inheriting:
            bridges[hit.target_key] = LegacyBridge(
                legacy_opportunity_id=str(row.id),
                legacy_target_key=row.target_key,
                legacy_status=row.status,
                carried=carried,
            )
    return bridges
