#!/usr/bin/env python
# Append re-priced execution-cost projections for persisted artifacts.
#
# Repricing is APPEND-ONLY (invariant 3): for every targeted raw artifact this
# inserts one new ``execution_cost_projections`` row under the requested
# ``(formula_version, pricing_version)`` composite identity. Existing rows are
# never updated; artifacts already projected under that identity are skipped.
#
# SAFETY: this script NEVER calls a provider. It reads only persisted
# artifacts/attempt rows plus the config-owned pricing catalogues. The
# requested formula version must equal the formula this code actually computes
# (``EXECUTION_COST_FORMULA_VERSION``) — stamping arithmetic we did not run
# would be a fabricated measurement. ``--dry-run`` reports what would be
# appended without writing anything.
#
# Usage (from ``backend/``):
#
#     uv run python -m scripts.reprice_execution_costs \
#         --formula-version line-sum-v1 --pricing-version unverified-rates-v1 \
#         [--artifact-id UUID ...] [--dry-run]
from __future__ import annotations

import argparse
import asyncio
import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select

from app.core.config.costs import EXECUTION_COST_FORMULA_VERSION, pricing_version_known
from app.core.database import SessionLocal
from app.domain.audits.cost_projection import append_repricing
from app.models.audit import ExecutionCostProjection, RawResponseArtifact

logger = logging.getLogger("scripts.reprice_execution_costs")


@dataclass(frozen=True)
class RepricingPlan:
    """Deterministic split of candidate artifacts for one repricing run."""

    targets: tuple[uuid.UUID, ...]
    already_projected: tuple[uuid.UUID, ...]


def select_repricing_targets(
    *,
    artifact_ids: Iterable[uuid.UUID],
    existing_artifact_ids: frozenset[uuid.UUID],
) -> RepricingPlan:
    """Split candidates into append targets vs already-projected.

    Input order is preserved and duplicate ids collapse (first occurrence
    wins) so CLI reporting is deterministic.
    """

    seen: set[uuid.UUID] = set()
    targets: list[uuid.UUID] = []
    already: list[uuid.UUID] = []
    for artifact_id in artifact_ids:
        if artifact_id in seen:
            continue
        seen.add(artifact_id)
        if artifact_id in existing_artifact_ids:
            already.append(artifact_id)
        else:
            targets.append(artifact_id)
    return RepricingPlan(
        targets=tuple(targets), already_projected=tuple(already)
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Append re-priced execution-cost projections (append-only, never "
            "updates existing rows, never calls a provider)."
        )
    )
    parser.add_argument(
        "--formula-version",
        required=True,
        help=(
            "Formula version to stamp. Must equal the formula this build "
            f"computes ({EXECUTION_COST_FORMULA_VERSION!r})."
        ),
    )
    parser.add_argument(
        "--pricing-version",
        required=True,
        help="Pricing catalogue version to price under (must be catalogued).",
    )
    parser.add_argument(
        "--artifact-id",
        action="append",
        type=uuid.UUID,
        default=None,
        metavar="UUID",
        help=(
            "Restrict to these artifacts (repeatable). Default: every "
            "persisted raw artifact."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be appended without writing anything.",
    )
    return parser


class RepricingConfigurationError(Exception):
    """Raised when the requested versions cannot be honestly stamped."""


def _validate_versions(formula_version: str, pricing_version: str) -> None:
    if formula_version != EXECUTION_COST_FORMULA_VERSION:
        raise RepricingConfigurationError(
            f"--formula-version {formula_version!r} does not match the formula "
            f"this build computes ({EXECUTION_COST_FORMULA_VERSION!r}); "
            "stamping uncomputed arithmetic would be a fabrication"
        )
    if not pricing_version_known(pricing_version):
        raise RepricingConfigurationError(
            f"--pricing-version {pricing_version!r} is not a catalogued "
            "pricing version"
        )


async def _run(args: argparse.Namespace) -> int:
    _validate_versions(args.formula_version, args.pricing_version)
    async with SessionLocal() as session:
        statement = select(RawResponseArtifact.id).order_by(
            RawResponseArtifact.created_at, RawResponseArtifact.id
        )
        if args.artifact_id:
            statement = statement.where(
                RawResponseArtifact.id.in_(args.artifact_id)
            )
        artifact_ids = (await session.scalars(statement)).all()
        existing = frozenset(
            (
                await session.scalars(
                    select(ExecutionCostProjection.raw_response_artifact_id).where(
                        ExecutionCostProjection.formula_version
                        == args.formula_version,
                        ExecutionCostProjection.pricing_version
                        == args.pricing_version,
                    )
                )
            ).all()
        )
        plan = select_repricing_targets(
            artifact_ids=artifact_ids, existing_artifact_ids=existing
        )
        if not args.dry_run:
            for artifact_id in plan.targets:
                await append_repricing(
                    session,
                    artifact_id=artifact_id,
                    pricing_version=args.pricing_version,
                    formula_version=args.formula_version,
                )
            await session.commit()
    logger.info(
        "repricing.run.complete dry_run=%s formula_version=%s pricing_version=%s "
        "candidates=%d appended=%d already_projected=%d",
        args.dry_run,
        args.formula_version,
        args.pricing_version,
        len(artifact_ids),
        0 if args.dry_run else len(plan.targets),
        len(plan.already_projected),
    )
    if args.dry_run:
        logger.info(
            "repricing.run.dry_run would_append=%d — no rows written",
            len(plan.targets),
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return asyncio.run(_run(args))
    except RepricingConfigurationError as error:
        parser.error(str(error))
        return 2


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
