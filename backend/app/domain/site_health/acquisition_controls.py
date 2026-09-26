"""Read the durable stop policy before every network hop; never cache approval."""

from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.web_evidence.contracts import FetchError
from app.core.config.site_health_acquisition import ERROR_ACQUISITION_UNAVAILABLE
from app.core.database import SessionLocal
from app.models.web_acquisition_control import WebAcquisitionControl


async def authorize_acquisition(
    url: str, *, session_factory: async_sessionmaker[AsyncSession] = SessionLocal
) -> None:
    try:
        host = (
            (urlsplit(url).hostname or "")
            .encode("idna")
            .decode("ascii")
            .lower()
            .rstrip(".")
        )
    except ValueError as exc:  # includes UnicodeError from IDNA encoding
        raise FetchError(
            "Web acquisition target cannot be checked against operator policy",
            error_code=ERROR_ACQUISITION_UNAVAILABLE,
        ) from exc
    labels = host.split(".")
    # Multi-label suffixes only: a stray bare-TLD row ("com") must never act as
    # a second global stop. "*" is the one global scope.
    scopes = ["*", *(".".join(labels[index:]) for index in range(len(labels) - 1))]
    try:
        async with session_factory() as session:
            blocked = await session.scalar(
                select(WebAcquisitionControl.domain)
                .where(
                    WebAcquisitionControl.domain.in_(scopes),
                    WebAcquisitionControl.blocked.is_(True),
                )
                .limit(1)
            )
    except (SQLAlchemyError, OSError) as exc:
        # Fail closed through the fetcher's typed contract, never a raw DB error.
        raise FetchError(
            "Web acquisition policy is temporarily unavailable",
            error_code=ERROR_ACQUISITION_UNAVAILABLE,
        ) from exc
    if blocked is not None:
        raise FetchError(
            "Web acquisition is suppressed by operator policy",
            error_code=ERROR_ACQUISITION_UNAVAILABLE,
        )
