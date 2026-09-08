"""Thin trusted-admin CLI for persisted billing catalog and grant operations.

No command accepts credentials, merchant payloads, discount codes, or raw keys.
Every mutation requires actor, reason, idempotency key, explicit target and
``--dry-run`` (pass ``--apply`` only after reviewing dry-run output).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal, dispose_engine
from app.domain.billing.admin import (
    OperatorContext,
    catalog_diff,
    catalog_validate,
    import_catalog,
    inspect_account,
    issue_grant,
    publish_catalog,
    redact,
    revoke_grant,
    seed_catalog,
)
from app.models.user import User


async def _actor(session: object, identity: str) -> User:
    try:
        actor_id = uuid.UUID(identity)
    except ValueError:
        actor_id = None
    query = (
        select(User).where(User.id == actor_id)
        if actor_id
        else select(User).where(User.email == identity.strip().lower())
    )
    actor = await session.scalar(query)  # type: ignore[attr-defined]
    if actor is None or not actor.is_active or actor.role != "admin":
        raise PermissionError("active_admin_required")
    return actor


def _payload(path: str) -> dict[str, object]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("catalog payload must be an object")
    return value


async def _run(args: argparse.Namespace) -> dict[str, object]:
    async with SessionLocal() as session:
        if args.command == "catalog-validate":
            return await catalog_validate(_payload(args.file))
        if args.command == "catalog-diff":
            return await catalog_diff(session, _payload(args.file))
        actor = await _actor(session, args.actor)
        context = OperatorContext(
            actor=actor,
            reason=args.reason,
            idempotency_key=args.idempotency_key,
            dry_run=not args.apply,
        )
        result: dict[str, object]
        if args.command == "catalog-seed":
            row = await seed_catalog(session, context=context)
            result = {"revision": row.revision, "state": row.publication_state}
        elif args.command == "catalog-import":
            row = await import_catalog(
                session,
                revision=args.revision,
                payload=_payload(args.file),
                context=context,
            )
            result = {"revision": row.revision, "state": row.publication_state}
        elif args.command == "catalog-publish":
            row = await publish_catalog(
                session, revision=args.revision, context=context
            )
            result = {"revision": row.revision, "state": row.publication_state}
        elif args.command == "account-inspect":
            result = await inspect_account(
                session, account_id=uuid.UUID(args.account_id), context=context
            )
        elif args.command == "grant":
            grants = await issue_grant(
                session,
                account_id=uuid.UUID(args.account_id),
                key=args.key,
                value=args.value,
                valid_from=datetime.now(UTC),
                valid_until=None,
                context=context,
            )
            result = {"grant_ids": [str(grant.id) for grant in grants]}
        else:
            revocations = await revoke_grant(
                session,
                grant_id=uuid.UUID(args.grant_id),
                effective_from=datetime.now(UTC),
                context=context,
            )
            result = {
                "revocation_ids": [str(revocation.id) for revocation in revocations]
            }
        if args.apply:
            await session.commit()
        return {"dry_run": not args.apply, **redact(result)}


async def _run_and_dispose(args: argparse.Namespace) -> dict[str, object]:
    try:
        return await _run(args)
    finally:
        await dispose_engine()


def _mutation_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--actor", required=True, help="Persisted active admin UUID or email"
    )
    parser.add_argument("--reason", required=True)
    parser.add_argument("--idempotency-key", required=True)
    parser.add_argument(
        "--apply", action="store_true", help="Apply after reviewing the default dry-run"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("catalog-validate", "catalog-diff"):
        command = sub.add_parser(name)
        command.add_argument("--file", required=True)
    seed = sub.add_parser("catalog-seed")
    _mutation_options(seed)
    imported = sub.add_parser("catalog-import")
    imported.add_argument("--revision", required=True)
    imported.add_argument("--file", required=True)
    _mutation_options(imported)
    published = sub.add_parser("catalog-publish")
    published.add_argument("--revision", required=True)
    _mutation_options(published)
    account = sub.add_parser("account-inspect")
    account.add_argument("--account-id", required=True)
    _mutation_options(account)
    grant = sub.add_parser("grant")
    grant.add_argument("--account-id", required=True)
    grant.add_argument("--key", required=True)
    grant.add_argument("--value", required=True, type=int)
    _mutation_options(grant)
    revoke = sub.add_parser("revoke")
    revoke.add_argument("--grant-id", required=True)
    _mutation_options(revoke)
    try:
        output = asyncio.run(_run_and_dispose(parser.parse_args(argv)))
        print(json.dumps(output, sort_keys=True))
        return 0
    except Exception as exc:  # noqa: BLE001 - safe CLI boundary
        print(type(exc).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
