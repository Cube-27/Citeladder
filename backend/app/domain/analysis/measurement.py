"""Count-aware projections of persisted aggregate facts; never rescore answers."""

from __future__ import annotations

from app.domain.analysis.schemas import MeasurementCounts


def measurement_counts(metrics: dict) -> MeasurementCounts:
    completed = int(metrics.get("total_completed") or 0)
    counts = (metrics.get("share_of_voice") or {}).get("mention_counts")
    competitors = set(metrics.get("competitor_mention_rate") or {})
    brand = (
        sum(int(value) for name, value in counts.items() if name not in competitors)
        if isinstance(counts, dict)
        else None
    )
    return MeasurementCounts(
        state="measured" if completed else "no_observations",
        responses=completed,
        brand_responses=metrics.get("brand_mention_count", brand),
        owned_citation_responses=metrics.get("owned_citation_response_count"),
        entity_presences=sum(counts.values()) if isinstance(counts, dict) else None,
        expected=(metrics.get("coverage") or {}).get("requested"),
        failed=(metrics.get("coverage") or {}).get("failed"),
        not_run=(metrics.get("coverage") or {}).get("not_run"),
    )


def observed_rate(metrics: dict, key: str) -> float | None:
    if not metrics.get("total_completed"):
        return None
    counts = measurement_counts(metrics)
    numerator = {
        "brand_mention_rate": counts.brand_responses,
        "owned_citation_rate": counts.owned_citation_responses,
    }.get(key)
    if numerator is not None:
        return numerator / counts.responses
    return metrics.get(key)


def prompt_performance(metrics: dict) -> float | None:
    """Project already-computed prompt composites without changing their formula."""
    scores = [
        row["composite_score"]
        for row in metrics.get("per_prompt", [])
        if row.get("composite_score") is not None
    ]
    return round(sum(scores) / len(scores), 2) if scores else None


def competitor_rate(metrics: dict, key: str, name: str) -> float | None:
    total = metrics.get("total_completed")
    if not total:
        return None
    counts = (metrics.get("share_of_voice") or {}).get("mention_counts") or {}
    if key == "competitor_mention_rate" and name in counts:
        return counts[name] / total
    return (metrics.get(key) or {}).get(name)
