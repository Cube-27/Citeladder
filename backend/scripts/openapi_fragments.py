"""OpenAPI route-family fragments for the TypeScript parity gate.

A route family is one OpenAPI tag. Its fragment holds the family's operations
and every component schema they reach, so the TS service's generated document
can be compared with what FastAPI publishes for the same routes (TypeScript
migration rule 4). The comparison itself, which normalizes the known
Pydantic/zod spelling differences, lives in the TS service
(``frontend/services/api/src/openapi/fragment.ts``).

``parity_fragment`` is the fixture that proves that normalization: a small
FastAPI app whose models exercise the known drift traps (optional versus
nullable, defaults, literals and enums, formats, nested and keyed objects).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, FastAPI, Query, status
from pydantic import BaseModel, Field

from app.core.config.api import API_V1_PREFIX

_COMPONENT_PREFIX = "#/components/schemas/"
PARITY_FAMILY = "parity"


def _operations(spec: dict[str, Any], family: str) -> dict[str, dict[str, Any]]:
    paths: dict[str, dict[str, Any]] = {}
    for path, item in spec.get("paths", {}).items():
        for method, operation in item.items():
            if family in operation.get("tags", []):
                paths.setdefault(path, {})[method] = operation
    return paths


def _referenced_components(node: Any, found: set[str]) -> None:
    if isinstance(node, dict):
        reference = node.get("$ref")
        if isinstance(reference, str) and reference.startswith(_COMPONENT_PREFIX):
            found.add(reference.removeprefix(_COMPONENT_PREFIX))
        for value in node.values():
            _referenced_components(value, found)
    elif isinstance(node, list):
        for value in node:
            _referenced_components(value, found)


def family_fragment(spec: dict[str, Any], family: str) -> dict[str, Any]:
    """The family's operations plus the transitive closure of their schemas."""
    paths = _operations(spec, family)
    if not paths:
        msg = f"OpenAPI document has no operations tagged {family!r}"
        raise ValueError(msg)
    schemas = spec.get("components", {}).get("schemas", {})
    reached: set[str] = set()
    pending: set[str] = set()
    _referenced_components(paths, pending)
    while pending:
        name = pending.pop()
        reached.add(name)
        nested: set[str] = set()
        _referenced_components(schemas[name], nested)
        pending |= nested - reached
    return {
        "family": family,
        "openapi": spec["openapi"],
        "paths": paths,
        "components": {"schemas": {name: schemas[name] for name in sorted(reached)}},
    }


class _Tone(StrEnum):
    calm = "calm"
    loud = "loud"


class _Child(BaseModel):
    label: str
    weight: float


class _ParityResponse(BaseModel):
    id: UUID
    created_at: datetime
    name: str = Field(max_length=80)
    note: str | None
    nickname: str | None = None
    count: int = 0
    kind: Literal["alpha", "beta"]
    fixed: Literal["only"] = "only"
    tone: _Tone
    tags: list[str]
    children: list[_Child]
    best_child: _Child | None
    totals: dict[str, int]


class _ParityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    note: str | None = None
    kind: Literal["alpha", "beta"] = "alpha"


def _parity_app() -> FastAPI:
    router = APIRouter(tags=[PARITY_FAMILY])

    @router.get("/parity/{item_id}", response_model=_ParityResponse)
    async def read_item(
        item_id: UUID,
        limit: int = Query(default=20, ge=1, le=100),
        cursor: str | None = None,
    ) -> None: ...

    @router.post(
        "/parity",
        response_model=_ParityResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_item(body: _ParityCreate) -> None: ...

    @router.delete("/parity/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_item(item_id: UUID) -> None: ...

    app = FastAPI()
    app.include_router(router, prefix=API_V1_PREFIX)
    return app


def parity_fragment() -> dict[str, Any]:
    """The fixture family's fragment, as FastAPI publishes it."""
    return family_fragment(_parity_app().openapi(), PARITY_FAMILY)
