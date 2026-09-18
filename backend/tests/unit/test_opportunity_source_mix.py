from __future__ import annotations

import uuid

from app.analysis.opportunities.detectors import (
    AnalysisEvidence,
    PromptSnapshotEvidence,
)
from app.analysis.opportunities.source_mix import build_source_projection
from app.analysis.opportunities.source_patterns import CitationEvidence


def _analysis(
    index: int, *citations: CitationEvidence, brand_mentioned: bool = False
) -> AnalysisEvidence:
    return AnalysisEvidence(
        analysis_id=uuid.uuid4(),
        prompt_index=index,
        logical_engine="chatgpt",
        owned_citation_count=0,
        brand_mentioned=brand_mentioned,
        competitor_names=("Rival",),
        citations=tuple(citations),
        artifact_id=uuid.uuid4(),
    )


def _citation(domain: str, *, competitor: str | None = None) -> CitationEvidence:
    return CitationEvidence(
        domain=domain,
        url=f"https://{domain}/guide",
        title="Guide",
        is_owned=False,
        matched_competitor=competitor,
    )


def test_source_mix_deduplicates_within_answer_and_counts_across_answers() -> None:
    analyses = (
        _analysis(0, _citation("forbes.com"), _citation("forbes.com")),
        _analysis(
            1,
            _citation("forbes.com"),
            _citation("rival.test", competitor="Rival"),
        ),
    )
    snapshots = (
        PromptSnapshotEvidence(0, None, "Best tool?", "tools", "purchase"),
        PromptSnapshotEvidence(1, None, "Compare tools", "tools", "comparison"),
    )
    source_mix, action_mix, rollups = build_source_projection(
        analyses=analyses, snapshots=snapshots, gap_prompt_indices={0, 1}
    )
    assert source_mix["counts"] == {"competitive_evidence": 1, "earned": 2}
    assert source_mix["observation_count"] == 3
    assert action_mix["counts"] == {"earned": 2, "owned": 1}
    forbes = next(row for row in rollups if row["canonical_domain"] == "forbes.com")
    assert forbes["answer_count"] == 2
    assert forbes["usage_denominator"] == 2
    # The mix survives for the Sources display. Its ``actionable`` flag no
    # longer produces anything: the domain-keyed detector it fed is retired,
    # and a task now needs a page somebody read.
    assert forbes["actionable"] is True


def test_source_mix_preserves_not_applicable_and_unavailable() -> None:
    not_applicable, _, _ = build_source_projection(
        analyses=(), snapshots=(), gap_prompt_indices=set()
    )
    unavailable, _, _ = build_source_projection(
        analyses=(_analysis(0),),
        snapshots=(PromptSnapshotEvidence(0, None, "Question", "", ""),),
        gap_prompt_indices={0},
    )
    assert not_applicable["state"] == "not_applicable"
    assert unavailable["state"] == "unavailable"


def test_a_competitor_owned_domain_is_never_on_the_earned_path() -> None:
    analyses = (
        _analysis(0, _citation("rival.test", competitor="Rival")),
        _analysis(0, _citation("rival.test", competitor="Rival")),
    )
    _, action_mix, rollups = build_source_projection(
        analyses=analyses,
        snapshots=(PromptSnapshotEvidence(0, None, "Question", "", ""),),
        gap_prompt_indices={0},
    )
    assert action_mix["counts"] == {"owned": 2}
    assert all(row["pathway"] != "earned" for row in rollups)


def test_a_google_search_surface_is_never_on_the_earned_path() -> None:
    """A page Google generated is not somebody you can pitch.

    `action_path` used to read "anything that is not `other_third_party` is
    earned", so the moment `search_surface` existed as a class it became a
    pitch target -- inverting the very thing the class was added to prevent.
    The rollup keeps the citation and records no pathway for it.
    """
    analyses = (
        _analysis(0, _citation("google.com")),
        _analysis(1, _citation("google.com")),
    )
    _, action_mix, rollups = build_source_projection(
        analyses=analyses,
        snapshots=(
            PromptSnapshotEvidence(0, None, "Question", "", ""),
            PromptSnapshotEvidence(1, None, "Another", "", ""),
        ),
        gap_prompt_indices={0, 1},
    )
    assert action_mix["counts"] == {}
    assert rollups
    assert all(row["pathway"] is None for row in rollups)
    assert all(row["source_class"] == "search_surface" for row in rollups)


def test_a_youtube_citation_stays_on_the_earned_path() -> None:
    """Google owning the platform is not a reason to drop the opportunity.

    The channel behind a video is a real author a customer can approach, so
    it stays pursuable even though its provenance is `google_owned`.
    """
    analyses = (
        _analysis(0, _citation("youtube.com")),
        _analysis(1, _citation("youtube.com")),
    )
    _, action_mix, rollups = build_source_projection(
        analyses=analyses,
        snapshots=(
            PromptSnapshotEvidence(0, None, "Question", "", ""),
            PromptSnapshotEvidence(1, None, "Another", "", ""),
        ),
        gap_prompt_indices={0, 1},
    )
    assert action_mix["counts"] == {"earned": 2}
    assert all(row["pathway"] == "earned" for row in rollups)
