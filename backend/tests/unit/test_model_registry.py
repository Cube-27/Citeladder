"""Pure guards for ORM model registration used by Alembic metadata."""

from __future__ import annotations

import app.models as models


def test_guidance_and_commerce_models_are_exported_and_registered_once() -> None:
    expected = {
        "OpportunityGuidance": "opportunity_guidance",
        "OrderFact": "order_facts",
        "FeedIssue": "feed_issues",
        "CommerceDiscoveryRun": "commerce_discovery_runs",
        "CommerceDiscoveryTask": "commerce_discovery_tasks",
        "CommerceDiscoveryArtifact": "commerce_discovery_artifacts",
        "CommerceDiscoveryCandidate": "commerce_discovery_candidates",
        "CommerceCandidateReview": "commerce_candidate_reviews",
        "CompetitorComparisonSnapshot": "competitor_comparison_snapshots",
    }

    assert len(models.__all__) == len(set(models.__all__))
    for model_name, table_name in expected.items():
        assert model_name in models.__all__
        assert getattr(models, model_name).__table__.name == table_name
        assert table_name in models.Base.metadata.tables
