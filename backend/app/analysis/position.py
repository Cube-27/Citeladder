"""Where a brand sits among the brands an answer names.

Position is arithmetic over evidence the run already produces: every named
entity carries the character offset of its first alias hit, so ordering those
offsets ranks the brands inside one answer. Nothing here calls a provider or
scores an opinion — a rank is an observation about word order, and treating it
as a judgement was what kept this metric on a roadmap it never belonged on.

Every mean here is taken over the answers that named the entity AT ALL. An
answer that never named it has no rank, which is not the same as a worst rank,
and visibility already reports how often that happens.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # `scoring` imports this module, so the type stays a name.
    pass


def brand_position(
    brand_offset: int | None, competitor_offsets: Mapping[str, int | None]
) -> int | None:
    """The brand's rank among the brands named in ONE answer, 1-based.

    A brand that is not named has no position — distinct from last place, which
    is why this is ``None`` rather than the count of competitors plus one. A
    named brand whose offset could not be resolved is also ``None``: unknown is
    not rank one.
    """
    if brand_offset is None:
        return None
    ahead = sum(
        1
        for offset in competitor_offsets.values()
        if offset is not None and offset < brand_offset
    )
    return ahead + 1


def competitor_position(score: dict[str, Any], name: str) -> int | None:
    """One competitor's rank inside one answer, by the same offset ordering."""
    offsets = score.get("competitor_first_offsets") or {}
    own = offsets.get(name)
    if own is None:
        return None
    brand_offset = score.get("brand_first_offset")
    ahead = sum(
        1
        for other, offset in offsets.items()
        if other != name and offset is not None and offset < own
    )
    if brand_offset is not None and brand_offset < own:
        ahead += 1
    return ahead + 1
