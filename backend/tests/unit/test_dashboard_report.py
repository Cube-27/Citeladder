from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.domain.dashboard.report import render_dashboard_pdf
from app.domain.dashboard.schemas import (
    DashboardProject,
    DashboardResponse,
    DashboardSection,
    DashboardSource,
)


def test_dashboard_report_escapes_dynamic_paragraph_text() -> None:
    dashboard = DashboardResponse(
        project=DashboardProject(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            name="Name <&>",
            brand_name="Brand <&>",
            website_url="https://example.com",
        ),
        generated_at=datetime.now(UTC),
        executive_metrics={"score <&>": "value <&>"},
        analyze=[
            DashboardSection(
                id="visibility",
                title="Visibility <&>",
                href="/visibility",
                state="ready",
                metrics={"metric <&>": "value <&>"},
                source=DashboardSource(
                    id=uuid.uuid4(),
                    kind="source <&>",
                    timestamp=datetime.now(UTC),
                ),
            )
        ],
        improve=[],
        active_work=[],
    )

    assert render_dashboard_pdf(dashboard).startswith(b"%PDF")
