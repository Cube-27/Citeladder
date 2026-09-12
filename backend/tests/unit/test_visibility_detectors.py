"""The visibility detectors' firing conditions, as a truth table.

``brand_absent_high_value_prompt`` is a claim about ABSENCE. It used to fire
on "zero owned citations + a competitor is present", which is a claim about
CITATIONS — so an answer that recommended the brand BY NAME, while linking to
a review site, produced a high-severity "Brand absent" card. These cases pin
the two observations apart.
"""

from __future__ import annotations

import uuid

import pytest

from app.analysis.opportunities.detectors import (
    AnalysisEvidence,
    PromptSnapshotEvidence,
    VisibilityEvidence,
    detect_brand_absent_high_value_prompt,
    detect_owned_page_not_cited,
)


def _analysis(
    *,
    brand_mentioned: bool,
    owned_citation_count: int,
    competitors: tuple[str, ...],
    engine: str = "chatgpt",
) -> AnalysisEvidence:
    return AnalysisEvidence(
        analysis_id=uuid.uuid4(),
        prompt_index=0,
        logical_engine=engine,
        owned_citation_count=owned_citation_count,
        brand_mentioned=brand_mentioned,
        competitor_names=competitors,
    )


def _evidence(*analyses: AnalysisEvidence) -> VisibilityEvidence:
    return VisibilityEvidence(
        audit_id=uuid.uuid4(),
        analyses=analyses,
        prompt_snapshots=(
            PromptSnapshotEvidence(
                prompt_index=0,
                prompt_id=uuid.uuid4(),
                text="best running shoes for flat feet",
                theme="footwear",
                intent="comparison",
                buyer_stage="evaluation",
                prompt_intent="comparison",
            ),
        ),
        owned_domains=("acme.example",),
    )


# brand mentioned x owned citation x competitor present.
@pytest.mark.parametrize(
    ("brand_mentioned", "owned", "competitors", "expect_absent", "expect_uncited"),
    [
        # The regression: named and recommended, but nothing owned is cited.
        # A citation gap, never absence.
        (True, 0, ("Rival",), False, True),
        (True, 0, (), False, True),
        # Genuine absence: not named, not cited, a competitor took the slot.
        (False, 0, ("Rival",), True, True),
        # Not named, not cited, and no competitor either — nobody was named,
        # so there is no competitive gap to claim.
        (False, 0, (), False, True),
        # An owned citation closes both rules regardless of the rest.
        (True, 2, ("Rival",), False, False),
        (False, 2, ("Rival",), False, False),
    ],
)
def test_brand_absence_truth_table(
    brand_mentioned: bool,
    owned: int,
    competitors: tuple[str, ...],
    expect_absent: bool,
    expect_uncited: bool,
) -> None:
    evidence = _evidence(
        _analysis(
            brand_mentioned=brand_mentioned,
            owned_citation_count=owned,
            competitors=competitors,
        )
    )
    assert bool(detect_brand_absent_high_value_prompt(evidence)) is expect_absent
    assert bool(detect_owned_page_not_cited(evidence)) is expect_uncited


def test_one_naming_repetition_is_enough_to_refute_absence() -> None:
    """Absence is a claim about EVERY observation, not the majority.

    If any engine named the brand, the brand is not absent from the prompt —
    it is missing from the other engines, which is a coverage observation.
    """
    evidence = _evidence(
        _analysis(
            brand_mentioned=False,
            owned_citation_count=0,
            competitors=("Rival",),
            engine="perplexity",
        ),
        _analysis(
            brand_mentioned=True,
            owned_citation_count=0,
            competitors=("Rival",),
            engine="chatgpt",
        ),
    )
    assert detect_brand_absent_high_value_prompt(evidence) == []


def test_no_observations_is_not_measured_absence() -> None:
    """A prompt nothing answered cannot support an absence claim."""
    evidence = _evidence()
    assert detect_brand_absent_high_value_prompt(evidence) == []
    assert detect_owned_page_not_cited(evidence) == []


def test_a_hit_records_what_was_actually_observed() -> None:
    """The evidence says how much was seen, and by which engines."""
    evidence = _evidence(
        _analysis(
            brand_mentioned=False,
            owned_citation_count=0,
            competitors=("Rival",),
            engine="chatgpt",
        ),
        _analysis(
            brand_mentioned=False,
            owned_citation_count=0,
            competitors=("Rival",),
            engine="perplexity",
        ),
    )
    (hit,) = detect_brand_absent_high_value_prompt(evidence)
    assert hit.evidence["repetitions"] == 2
    assert hit.evidence["observed_engines"] == ["chatgpt", "perplexity"]
    assert hit.evidence["brand_mentioned"] is False
