"""Business-map cells: compatibility, spread, provenance and suggestion merge."""

from __future__ import annotations

import uuid

from app.domain.projects.business_map import (
    BusinessMap,
    BusinessMapEntry,
    BusinessMapExclusion,
    OfferingMap,
    read_business_map,
    with_model_suggestions,
)
from app.domain.prompts.generation_cells import (
    CellTopic,
    offering_for_topic,
    plan_generation_cells,
)

TOPIC_ID = uuid.uuid4()


def _entry(value: str, review_state: str = "confirmed") -> BusinessMapEntry:
    return BusinessMapEntry(
        value=value,
        origin="manual" if review_state == "confirmed" else "model",
        review_state=review_state,  # type: ignore[arg-type]
    )


def _topic(offering_map: OfferingMap | None, name: str = "Running shoes"):
    return CellTopic(
        topic_id=TOPIC_ID, name=name, description="", offering_map=offering_map
    )


def test_excluded_pairs_never_share_a_cell_and_facets_stay_bounded() -> None:
    offering = OfferingMap(
        offering="Running shoes",
        attributes=[_entry("waterproof"), _entry("carbon plate")],
        situations=[_entry("trail running"), _entry("marathon training")],
        audiences=[_entry("beginners")],
        exclusions=[BusinessMapExclusion(first="carbon plate", second="trail running")],
    )

    cells = plan_generation_cells([_topic(offering)], total=40)

    for cell in cells:
        facets = [f for f in (cell.attribute, cell.situation, cell.audience) if f]
        assert len(facets) <= 2
        assert {cell.attribute, cell.situation} != {"carbon plate", "trail running"}
    # Every compatible value is reached before any combination repeats.
    assert {c.attribute for c in cells[:10]} >= {"waterproof", "carbon plate"}
    assert {c.buyer_stage for c in cells[:4]} == {
        "awareness",
        "consideration",
        "decision",
        "implementation",
    }


def test_confirmed_entries_ground_cells_before_unreviewed_suggestions() -> None:
    offering = OfferingMap(
        offering="Running shoes",
        attributes=[_entry("wide fit"), _entry("vegan", "suggested")],
    )

    cells = plan_generation_cells([_topic(offering)], total=3)

    assert [(c.attribute, c.suggested) for c in cells] == [
        ("", False),
        ("wide fit", False),
        ("vegan", True),
    ]
    assert cells[2].evidence_ref()["review_state"] == "suggested"


def test_a_topic_without_a_map_gets_bare_cells_not_invented_facts() -> None:
    cells = plan_generation_cells(
        [_topic(None)], total=5, markets=["Sydney", "Melbourne"]
    )

    assert len(cells) == 5
    assert all(c.offering == "Running shoes" for c in cells)
    assert all(not (c.attribute or c.situation or c.audience) for c in cells)
    assert {c.market for c in cells} == {"Sydney", "Melbourne"}


def test_a_subtopic_is_grounded_in_its_parent_offering() -> None:
    business_map = BusinessMap(offerings=[OfferingMap(offering="Running Shoes")])

    assert offering_for_topic(business_map, "Trail shoes", "running shoes")
    assert offering_for_topic(business_map, "Trail shoes", None) is None


def test_model_suggestions_fill_only_empty_confirmed_offerings() -> None:
    context = {
        "category": "footwear",
        "business_map": BusinessMap(
            offerings=[
                OfferingMap(offering="Running shoes", attributes=[_entry("wide fit")])
            ]
        ).model_dump(mode="json"),
    }
    suggestions = [
        OfferingMap(
            offering="running shoes", attributes=[_entry("vegan", "suggested")]
        ),
        OfferingMap(offering="Sandals", audiences=[_entry("hikers", "suggested")]),
        OfferingMap(offering="Boots", attributes=[_entry("steel toe", "suggested")]),
    ]

    updated = with_model_suggestions(
        context,
        suggestions,
        offerings=["Running shoes", "Sandals"],
        run_id="run-1",
    )

    assert updated is not None
    assert updated["category"] == "footwear"
    merged = {item.offering: item for item in read_business_map(updated).offerings}
    # A person's entries win; an unconfirmed offering is never mapped.
    assert [e.value for e in merged["Running shoes"].attributes] == ["wide fit"]
    assert set(merged) == {"Running shoes", "Sandals"}
    assert merged["Sandals"].audiences[0].source["generation_run_id"] == "run-1"
    assert (
        with_model_suggestions(
            updated, suggestions[:1], offerings=["Running shoes"], run_id="run-2"
        )
        is None
    )
