from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.domain.dashboard.schemas import DashboardResponse


def _paragraph_text(value: object) -> str:
    return escape(str(value))


def render_dashboard_pdf(dashboard: DashboardResponse) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Searchify report - {dashboard.project.brand_name}",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Searchify Executive Report", styles["Title"]),
        Paragraph(
            _paragraph_text(dashboard.project.brand_name or dashboard.project.name),
            styles["Heading2"],
        ),
        Paragraph(
            f"Generated {_paragraph_text(dashboard.generated_at.isoformat())}",
            styles["BodyText"],
        ),
        Spacer(1, 8 * mm),
        Paragraph("Executive summary", styles["Heading2"]),
    ]
    for name, value in dashboard.executive_metrics.items():
        display = value if value is not None else "Not set up"
        story.append(
            Paragraph(
                f"{_paragraph_text(name.replace('_', ' ').title())}: "
                f"{_paragraph_text(display)}",
                styles["BodyText"],
            )
        )
    groups = (("Analyze", dashboard.analyze), ("Improve", dashboard.improve))
    for heading, sections in groups:
        story.extend([Spacer(1, 6 * mm), Paragraph(heading, styles["Heading2"])])
        for section in sections:
            story.append(Paragraph(_paragraph_text(section.title), styles["Heading3"]))
            story.append(
                Paragraph(
                    f"State: {_paragraph_text(section.state.replace('_', ' '))}",
                    styles["BodyText"],
                )
            )
            for name, value in section.metrics.items():
                display = value if value is not None else "Not set up"
                story.append(
                    Paragraph(
                        f"{_paragraph_text(name.replace('_', ' ').title())}: "
                        f"{_paragraph_text(display)}",
                        styles["BodyText"],
                    )
                )
            if section.source:
                source = section.source
                story.append(
                    Paragraph(
                        f"Source: {_paragraph_text(source.kind)} "
                        f"{_paragraph_text(source.id)} at "
                        f"{_paragraph_text(source.timestamp.isoformat())}",
                        styles["BodyText"],
                    )
                )
    story.extend(
        [
            Spacer(1, 6 * mm),
            Paragraph("Limitations", styles["Heading2"]),
            Paragraph(
                "This report uses the latest completed persisted source available "
                "independently for each section. Missing values are shown as Not set "
                "up; no providers or websites were contacted while generating it.",
                styles["BodyText"],
            ),
        ]
    )
    document.build(story)
    return buffer.getvalue()
