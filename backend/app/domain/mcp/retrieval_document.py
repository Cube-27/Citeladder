"""Normalized MCP retrieval documents and record URI parsing."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit

from app.core.config.mcp import MCP_MAX_DOCUMENT_BYTES, mcp_public_origin
from app.domain.mcp.common import _FETCHABLE_KINDS
from app.domain.mcp.schemas import RetrievalDocument, RetrievalMetadata, json_text


def retrieval_document(
    kind: str,
    row_id: uuid.UUID,
    requested_part: int,
    record: dict[str, Any],
    title: str,
    project_id: uuid.UUID,
    observed_at: datetime | date | None,
) -> dict[str, Any]:
    url = _application_record_url(kind, project_id, row_id, record)
    serialized = json_text(record)
    parts = [
        serialized[index : index + MCP_MAX_DOCUMENT_BYTES]
        for index in range(0, len(serialized), MCP_MAX_DOCUMENT_BYTES)
    ] or [""]
    if requested_part >= len(parts):
        raise LookupError("The requested evidence part was not found")
    complete = len(parts) == 1
    base_uri = f"citeladder://{kind}/{row_id}"
    part_uris = [f"{base_uri}?part={index}" for index in range(len(parts))]
    document = RetrievalDocument(
        id=base_uri if complete else part_uris[requested_part],
        title=title,
        text=parts[requested_part],
        url=url,
        metadata=RetrievalMetadata(
            project_id=str(project_id),
            record_type=kind,
            observed_at=observed_at,
            complete=complete,
            record=record if complete else {},
            part=requested_part if not complete else None,
            part_count=len(parts),
            part_uris=part_uris if not complete else [],
        ),
    ).model_dump(mode="json")
    return {**(record if complete else {}), **document}


def _application_record_url(
    kind: str,
    project_id: uuid.UUID,
    row_id: uuid.UUID,
    record: dict[str, Any],
) -> str:
    origin = mcp_public_origin()
    project = quote(str(project_id), safe="")
    if kind in {"site_snapshot", "site_crawl", "site_page", "site_link"}:
        return f"{origin}/website?project={project}&evidence={row_id}"
    if kind in {"audit", "visibility_result", "citation"}:
        source = quote(str(record.get("url") or ""), safe="")
        suffix = f"&source={source}" if source else ""
        return f"{origin}/visibility?project={project}&evidence={row_id}{suffix}"
    if kind == "opportunity":
        return f"{origin}/opportunities?project={project}&opportunity={row_id}"
    if kind == "prompt":
        return f"{origin}/visibility/prompts?project={project}&prompt={row_id}"
    if kind in {"traffic_snapshot", "demand_snapshot", "query_snapshot", "query_row"}:
        return f"{origin}/performance?project={project}&evidence={row_id}"
    if kind in {"search_run", "search_dataset", "search_row"}:
        return f"{origin}/search-intelligence?project={project}&evidence={row_id}"
    return f"{origin}/dashboard?project={project}&evidence={row_id}"


def parse_record_id(record_id: str) -> tuple[str, uuid.UUID, int]:
    parsed = urlsplit(record_id)
    if parsed.scheme != "citeladder" or not parsed.netloc:
        raise ValueError("id must be a citeladder:// record URI returned by search")
    kind = parsed.netloc
    if kind not in _FETCHABLE_KINDS:
        raise ValueError("Unsupported CiteLadder record type")
    try:
        row_id = uuid.UUID(parsed.path.lstrip("/"))
    except ValueError as exc:
        raise ValueError("Record id must contain a UUID") from exc
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) - {"part"} or len(query.get("part", [])) > 1:
        raise ValueError("Record URI contains unsupported parameters")
    try:
        part = int(query.get("part", ["0"])[0])
    except ValueError as exc:
        raise ValueError("Record part must be a non-negative integer") from exc
    if part < 0:
        raise ValueError("Record part must be a non-negative integer")
    return kind, row_id, part
