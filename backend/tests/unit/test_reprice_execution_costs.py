"""Repricing CLI: explicit-version validation, dry-run parsing, and the pure
target selector. The CLI is append-only and never calls a provider (its only
imports are config/domain/models — no connector module).
"""

from __future__ import annotations

import uuid

import pytest

from app.core.config.costs import (
    EXECUTION_COST_FORMULA_VERSION,
    PRICING_CATALOG_VERSION,
)
from scripts.reprice_execution_costs import (
    RepricingConfigurationError,
    _validate_versions,
    build_parser,
    main,
    select_repricing_targets,
)


def test_parser_requires_both_versions() -> None:
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["--formula-version", EXECUTION_COST_FORMULA_VERSION])
    with pytest.raises(SystemExit):
        parser.parse_args(["--pricing-version", PRICING_CATALOG_VERSION])


def test_parser_accepts_explicit_versions_dry_run_and_artifact_ids() -> None:
    one, two = uuid.uuid4(), uuid.uuid4()
    args = build_parser().parse_args(
        [
            "--formula-version",
            EXECUTION_COST_FORMULA_VERSION,
            "--pricing-version",
            PRICING_CATALOG_VERSION,
            "--artifact-id",
            str(one),
            "--artifact-id",
            str(two),
            "--dry-run",
        ]
    )
    assert args.formula_version == EXECUTION_COST_FORMULA_VERSION
    assert args.pricing_version == PRICING_CATALOG_VERSION
    assert args.artifact_id == [one, two]
    assert args.dry_run is True


def test_parser_defaults_to_all_artifacts_without_dry_run() -> None:
    args = build_parser().parse_args(
        [
            "--formula-version",
            EXECUTION_COST_FORMULA_VERSION,
            "--pricing-version",
            PRICING_CATALOG_VERSION,
        ]
    )
    assert args.artifact_id is None
    assert args.dry_run is False


def test_validate_versions_accepts_the_current_constants() -> None:
    _validate_versions(EXECUTION_COST_FORMULA_VERSION, PRICING_CATALOG_VERSION)


def test_validate_versions_rejects_uncomputed_formula() -> None:
    with pytest.raises(RepricingConfigurationError, match="fabrication"):
        _validate_versions("line-sum-v999", PRICING_CATALOG_VERSION)


def test_validate_versions_rejects_unknown_pricing_version() -> None:
    with pytest.raises(RepricingConfigurationError, match="not a catalogued"):
        _validate_versions(EXECUTION_COST_FORMULA_VERSION, "no-such-version")


def test_main_exits_two_on_invalid_versions() -> None:
    with pytest.raises(SystemExit) as excinfo:
        main(["--formula-version", "line-sum-v999", "--pricing-version", "x"])
    assert excinfo.value.code == 2


def test_select_repricing_targets_splits_preserves_order_and_dedupes() -> None:
    one, two, three, four = (uuid.uuid4() for _ in range(4))
    plan = select_repricing_targets(
        artifact_ids=[one, two, one, three, two, four],
        existing_artifact_ids=frozenset({two, four}),
    )
    assert plan.targets == (one, three)
    assert plan.already_projected == (two, four)


def test_select_repricing_targets_empty_inputs() -> None:
    plan = select_repricing_targets(artifact_ids=[], existing_artifact_ids=frozenset())
    assert plan.targets == ()
    assert plan.already_projected == ()
