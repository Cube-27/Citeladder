"""Reading a snapshot frozen by an EARLIER scorer must still answer.

Snapshots are immutable by design, so a crawl that terminalized before a
projection field existed keeps rows without it forever. The response model
requires `label` and `description` on every pillar, so such a snapshot returned
500 for the whole Overview — one absent presentation field took down a page
whose measurements were all present and correct.
"""

from __future__ import annotations

import pytest

from app.core.config.site_health_contracts import AEO_READINESS_DIMENSIONS
from app.domain.site_health.measurement_api_schemas import OverviewDimensionResponse
from app.domain.site_health.service.overview import _aeo_dimensions

#: Exactly the shape persisted before this change: measurement fields only.
_LEGACY_PILLAR = {
    "key": "machine-readability",
    "score": None,
    "reason": "unresolved_checks",
    "coverage": 0.0,
    "earned_points": 0.0,
    "expected_points": 148.0,
    "determinate_points": 0.0,
    "dimension_applicability": "applicable",
    "determinate_checkpoint_ids": [],
    "dimension_measurement_state": "not_measured",
}


def test_legacy_pillar_rows_gain_their_presentation_fields() -> None:
    rows = _aeo_dimensions([_LEGACY_PILLAR])

    validated = OverviewDimensionResponse.model_validate(rows[0])

    assert validated.label == "Machine readability"
    assert validated.description
    assert validated.unresolved_count == 0
    # The MEASUREMENT is evidence and is never recomputed on the way out: a
    # legacy null score stays null rather than being invented at read time.
    assert validated.score is None
    assert validated.expected_points == pytest.approx(148.0)


def test_every_pillar_key_can_be_backfilled() -> None:
    rows = _aeo_dimensions(
        [{**_LEGACY_PILLAR, "key": key} for key in AEO_READINESS_DIMENSIONS]
    )

    assert len(rows) == len(AEO_READINESS_DIMENSIONS)
    for row in rows:
        assert OverviewDimensionResponse.model_validate(row).label


def test_a_row_naming_no_known_pillar_is_dropped_not_rendered() -> None:
    """A retired pillar key has no label to give it and no meaning to show."""
    rows = _aeo_dimensions([_LEGACY_PILLAR, {"key": "authority"}, "not-a-row"])

    assert [row["key"] for row in rows] == ["machine-readability"]


def test_current_rows_keep_the_values_the_scorer_froze() -> None:
    """Backfill fills gaps; it never overwrites what the scorer decided."""
    rows = _aeo_dimensions(
        [{**_LEGACY_PILLAR, "label": "Custom", "unresolved_count": 4}]
    )

    assert rows[0]["label"] == "Custom"
    assert rows[0]["unresolved_count"] == 4
