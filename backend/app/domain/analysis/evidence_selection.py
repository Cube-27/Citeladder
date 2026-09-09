"""Scoped evidence predicates and opaque, scope-bound keyset cursors."""

from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256

from sqlalchemy import and_, exists, or_, select

from app.domain.analysis.errors import TrendQueryError
from app.models.analysis import Citation, CompetitorMention, ResponseAnalysis


@dataclass(frozen=True)
class EvidenceFilters:
    outcome: str | None = None
    competitor: str | None = None
    domain: str | None = None
    url: str | None = None

    def apply(self, statement):
        if self.outcome not in {None, "brand_absent", "uncited", "competitor_gap"}:
            raise TrendQueryError("Unknown answer outcome")
        if self.outcome in {"brand_absent", "competitor_gap"}:
            statement = statement.where(ResponseAnalysis.brand_mentioned.is_(False))
        if self.outcome == "uncited":
            statement = statement.where(
                ResponseAnalysis.brand_mentioned.is_(True),
                ResponseAnalysis.owned_domain_cited.is_(False),
            )
        if self.competitor:
            statement = statement.where(
                exists(
                    select(CompetitorMention.id).where(
                        CompetitorMention.analysis_id == ResponseAnalysis.id,
                        CompetitorMention.competitor_name == self.competitor,
                    )
                )
            )
        if self.outcome == "competitor_gap" and not self.competitor:
            raise TrendQueryError("A competitor is required for a competitor gap")
        if self.domain or self.url:
            citation = select(Citation.id).where(
                Citation.analysis_id == ResponseAnalysis.id
            )
            if self.domain:
                citation = citation.where(Citation.domain == self.domain)
            if self.url:
                citation = citation.where(Citation.url == self.url)
            statement = statement.where(exists(citation))
        return statement


def scope_digest(values: dict) -> str:
    return sha256(json.dumps(values, sort_keys=True, default=str).encode()).hexdigest()


def encode_cursor(created_at: datetime, identity: uuid.UUID, scope: str) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(
            [
                created_at.isoformat(),
                str(identity),
                scope,
            ]
        ).encode()
    ).decode()


def apply_cursor(statement, cursor: str | None, scope: str):
    if not cursor:
        return statement
    try:
        timestamp, identity, stored_scope = json.loads(base64.urlsafe_b64decode(cursor))
        if not all(
            isinstance(value, str) for value in (timestamp, identity, stored_scope)
        ):
            raise ValueError("Invalid cursor fields")
        at = datetime.fromisoformat(timestamp)
        identity = uuid.UUID(identity)
        if stored_scope != scope or at.tzinfo is None:
            raise ValueError("Cursor scope changed")
    except (ValueError, TypeError, KeyError) as exc:
        raise TrendQueryError("Invalid evidence cursor for this selection") from exc
    return statement.where(
        or_(
            ResponseAnalysis.created_at < at,
            and_(ResponseAnalysis.created_at == at, ResponseAnalysis.id < identity),
        )
    )
