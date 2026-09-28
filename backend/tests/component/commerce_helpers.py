"""Persist catalog inputs for the Python-owned Commerce paths."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.commerce import (
    CommerceCategory,
    CommerceProduct,
    CommerceProductCategory,
)
from app.models.project import Project


async def seed_catalog(
    session_factory: async_sessionmaker[AsyncSession],
    project_id: str | uuid.UUID,
    rows: list[dict[str, str]],
) -> list[str]:
    async with session_factory() as session:
        project = await session.get(Project, uuid.UUID(str(project_id)))
        assert project is not None
        categories: dict[str, CommerceCategory] = {}
        ids: list[str] = []
        for row in rows:
            values = dict(row)
            category_name = values.pop("category", "")
            product = CommerceProduct(
                workspace_id=project.workspace_id, project_id=project.id, **values
            )
            session.add(product)
            await session.flush()
            ids.append(str(product.id))
            if not category_name:
                continue
            category = categories.get(category_name)
            if category is None:
                category = CommerceCategory(
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    name=category_name,
                    normalized_name=category_name.lower(),
                )
                session.add(category)
                await session.flush()
                categories[category_name] = category
            session.add(
                CommerceProductCategory(
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    product_id=product.id,
                    category_id=category.id,
                )
            )
        await session.commit()
        return ids
