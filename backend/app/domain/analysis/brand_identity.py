"""The marks and domains behind the brand names an analyzer recorded.

A mention is persisted as a NAME -- ``BrandMention.brand_name``,
``CompetitorMention.competitor_name`` -- because that is what was found in the
answer. A table showing those names as logo chips needs the same two things
every other brand chip in the product uses: the cached logo asset's URL, and a
website to fall back to.

Resolved by name against this project's own brand and competitor records,
which is the only link that exists: the analyzer matched an alias to produce
the mention in the first place, so the name IS the key. A name that resolves
to nothing simply has no mark, and the chip falls back to initials rather than
borrowing a logo from a brand that merely sounds similar.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.projects.service import brand_logo_url, competitor_logo_url
from app.models.brand import Brand, Competitor
from app.models.project import Project

__all__ = ["BrandIdentity", "brand_identities"]


@dataclass(frozen=True, slots=True)
class BrandIdentity:
    """What a chip needs to draw one brand: its mark, or where to find one."""

    logo_url: str | None
    website: str | None


def _key(name: str) -> str:
    return " ".join(str(name or "").split()).casefold()


async def brand_identities(
    session: AsyncSession, *, project_id: uuid.UUID
) -> dict[str, BrandIdentity]:
    """This project's brand and competitor marks, keyed by casefolded name.

    Includes every ALIAS a competitor declares, because the analyzer matches on
    aliases and records whichever form the answer used. Keying on the canonical
    name alone left "Wise" resolved and "TransferWise" bare, which reads on
    screen as two different companies.
    """
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.brand), selectinload(Project.competitors))
        )
    ).scalar_one_or_none()
    if project is None:
        return {}
    found: dict[str, BrandIdentity] = _brand_entry(project)
    for competitor in project.competitors or []:
        _add_competitor(found, project_id=project.id, competitor=competitor)
    return found


def _brand_entry(project: Project) -> dict[str, BrandIdentity]:
    """The tracked brand's own mark, keyed by its name."""
    brand: Brand | None = project.brand
    if brand is None or not brand.name:
        return {}
    return {
        _key(brand.name): BrandIdentity(
            logo_url=brand_logo_url(project.id) if brand.logo_asset_id else None,
            website=str(project.website_url or "") or None,
        )
    }


def _add_competitor(
    found: dict[str, BrandIdentity], *, project_id: uuid.UUID, competitor: Competitor
) -> None:
    """One competitor's mark, under its name and every alias it declares.

    ``setdefault``, so the tracked brand always wins a name collision: a
    competitor that lists the brand as an alias must not take over its chip.
    """
    domains = [str(entry) for entry in (competitor.domains or []) if entry]
    identity = BrandIdentity(
        logo_url=(
            competitor_logo_url(project_id, competitor.id)
            if competitor.logo_asset_id
            else None
        ),
        website=domains[0] if domains else None,
    )
    for name in (competitor.name, *(competitor.aliases or [])):
        if name:
            found.setdefault(_key(str(name)), identity)
