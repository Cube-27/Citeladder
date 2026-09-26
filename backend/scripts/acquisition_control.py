"""Trusted operator stop switch. Dry-run unless --apply; never performs a crawl."""

import argparse
import asyncio
from datetime import UTC, datetime
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.database import SessionLocal, dispose_engine
from app.domain.auth.security_events import record_security_event
from app.models.user import User
from app.models.web_acquisition_control import WebAcquisitionControl


def _domain(value: str) -> str:
    if value == "*":
        return value
    parsed = urlsplit(f"https://{value}")
    if (
        not parsed.hostname
        or parsed.netloc != value
        or parsed.path
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.port
    ):
        raise ValueError("Use a bare domain or * for the global stop")
    domain = parsed.hostname.encode("idna").decode().lower().rstrip(".")
    if "." not in domain:
        # A bare TLD such as "com" would silently suppress every host under it.
        raise ValueError("Use a registrable domain; * is the only global stop")
    return domain


async def _run(args: argparse.Namespace) -> None:
    domain = _domain(args.domain)
    reason = args.reason.strip()
    if not reason or len(reason) > 255:
        raise ValueError("Reason must be between 1 and 255 characters")
    async with SessionLocal() as session:
        actor = await session.scalar(
            select(User)
            .where(
                User.email == args.actor.lower(),
                User.is_active.is_(True),
                User.role == "admin",
            )
            .with_for_update()
        )
        if actor is None:
            raise PermissionError("An active platform admin is required")
        print(f"domain={domain} blocked={not args.resume} apply={args.apply}")
        if not args.apply:
            return
        values = dict(
            domain=domain,
            blocked=not args.resume,
            actor_id=actor.id,
            reason=reason,
            updated_at=datetime.now(UTC),
        )
        await session.execute(
            insert(WebAcquisitionControl)
            .values(**values)
            .on_conflict_do_update(index_elements=["domain"], set_=values)
        )
        record_security_event(session, event="acquisition.control", actor_id=actor.id)
        await session.commit()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actor", required=True, help="Persisted platform admin email")
    parser.add_argument(
        "--domain",
        required=True,
        help="Bare domain, including subdomains; * stops all web acquisition",
    )
    parser.add_argument("--reason", required=True)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--apply", action="store_true")
    try:
        await _run(parser.parse_args())
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
