"""Normalize provider usage into immutable execution-cost observations."""

from __future__ import annotations

from collections.abc import Mapping

from app.core.config.costs import EXECUTION_COST_PROJECTION_VERSION, MICRO_USD_PER_USD
from app.models.audit import ExecutionCostProjection, RawResponseArtifact


def _non_negative_int(value: object) -> int:
    if not isinstance(value, (int, float, str, bytes, bytearray)):
        return 0
    try:
        return max(0, int(value))
    except (OverflowError, TypeError, ValueError):
        return 0


def _cost_microusd(value: object) -> int:
    if not isinstance(value, (int, float, str, bytes, bytearray)):
        return 0
    try:
        return max(0, round(float(value) * MICRO_USD_PER_USD))
    except (OverflowError, TypeError, ValueError):
        return 0


def build_execution_cost_projection(
    artifact: RawResponseArtifact,
) -> ExecutionCostProjection:
    """Create the one normalized usage/cost observation for an artifact.

    This intentionally records only provider-reported cost (usually zero) and
    token counts. Versioned catalogue pricing and a user-facing estimate are
    separate T7 concerns; they must never rewrite this immutable observation.
    """

    usage: Mapping[str, object] = artifact.usage or {}
    input_tokens = _non_negative_int(
        usage.get("total_input_tokens", usage.get("input_tokens"))
    )
    output_tokens = _non_negative_int(
        usage.get("total_output_tokens", usage.get("output_tokens"))
    )
    total_tokens = (
        _non_negative_int(usage.get("total_tokens")) or input_tokens + output_tokens
    )
    return ExecutionCostProjection(
        audit_id=artifact.audit_id,
        task_id=artifact.task_id,
        raw_response_artifact_id=artifact.id,
        projection_version=EXECUTION_COST_PROJECTION_VERSION,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        provider_reported_cost_microusd=_cost_microusd(usage.get("provider_cost_usd")),
    )
