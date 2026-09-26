"""Record a verified enterprise agreement reference. Dry-run unless --apply."""

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal, dispose_engine
from app.domain.auth.enterprise_agreements import (
    AgreementReferenceInput,
    record_agreement_reference,
)
from app.models.user import User


async def _run(args: argparse.Namespace) -> None:
    contents = await asyncio.to_thread(Path(args.input).read_text, encoding="utf-8")
    payload = AgreementReferenceInput.model_validate_json(contents)
    async with SessionLocal() as session:
        actor_id = await session.scalar(
            select(User.id).where(User.email == args.actor.strip().lower())
        )
        if actor_id is None:
            raise PermissionError("Unknown operator")
        row = await record_agreement_reference(
            session, actor_id=actor_id, payload=payload
        )
        print(
            f"workspace={row.workspace_id} reference={row.reference} apply={args.apply}"
        )
        if args.apply:
            await session.commit()
        else:
            await session.rollback()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actor", required=True)
    parser.add_argument(
        "--input", required=True, help="Local JSON reference, never the contract body"
    )
    parser.add_argument("--apply", action="store_true")
    try:
        await _run(parser.parse_args())
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
