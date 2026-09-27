#!/usr/bin/env python
# Report how the JEV prompt-quality gate agrees with user review outcomes.
#
# Reads every judged prompt candidate a user accepted or rejected (plus the
# gate's own rejections, counted only) and prints an aggregate JSON report:
# per-question false-flag/false-reject/catch rates, the verdict x outcome
# matrix, a fail-threshold sweep and agreement by business category. See
# ``app/domain/prompts/quality_calibration.py`` for the definitions.
#
# SAFETY: read-only and aggregate. It never calls JEV or any provider, never
# writes, and never reads or prints prompt text. Record the chosen thresholds
# in the PR that changes ``JEV_*`` thresholds and ``JEV_POLICY_VERSION``.
#
# Usage (from ``backend/``):
#
#     uv run python -m scripts.jev_calibration [--since 2026-10-01]
from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime

from app.core.database import SessionLocal
from app.domain.prompts.quality_calibration import (
    ReviewedDecision,
    calibration_report,
    load_reviewed_decisions,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Aggregate JEV gate calibration against user review outcomes."
    )
    parser.add_argument(
        "--since",
        type=datetime.fromisoformat,
        default=None,
        help="Only candidates generated on or after this ISO date.",
    )
    return parser


async def _load(since: datetime | None) -> list[ReviewedDecision]:
    async with SessionLocal() as session:
        return await load_reviewed_decisions(session, since=since)


def main() -> None:
    args = build_parser().parse_args()
    report = calibration_report(asyncio.run(_load(args.since)))
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
