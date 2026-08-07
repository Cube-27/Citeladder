"""Validate CiteLadder's active documentation boundary.

The repository deliberately archives superseded product plans. This check keeps
new or resurrected documents from silently becoming competing implementation
authorities and verifies local Markdown links in the active tree.

Run from the repository root:

    python docs/validate_documentation.py
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_PREFIX = "docs/archive/"

ACTIVE_EXACT = {
    "Agents.md",
    "COMMANDS.md",
    "CONTRIBUTING.md",
    "PRODUCT.md",
    "README.md",
    "Review.md",
    "docs/DEVELOPMENT.md",
    "docs/README.md",
    "docs/api-error-contract.md",
    "docs/architecture.md",
    "docs/backend-architecture.md",
    "docs/commerce-intelligence.md",
    "docs/design.md",
    "docs/documentation-index.md",
    "docs/frontend-architecture.md",
    "docs/integrations-traffic-analytics.md",
    "docs/invariants.md",
    "docs/site-health.md",
    "docs/validate_documentation.py",
    "docs/plans/growth-intelligence-platform.md",
    "docs/plans/site-intelligence-primary-product.md",
    "docs/plans/content-intelligence.md",
    "docs/plans/demand-intelligence.md",
    "docs/plans/growth-agent.md",
    "docs/plans/knowledge-kernel-and-industry-pack-spec.md",
    "docs/plans/codex-site-intelligence-wiring-handoff.md",
    "docs/plans/faq-intelligence-first-slice.md",
    "docs/plans/industry-packs/README.md",
}
ACTIVE_PREFIXES = (
    "docs/evaluations/",
    "docs/operations/",
    "backend/docs/",
    ".github/",
)
DOCUMENT_SUFFIXES = {".md", ".mdx", ".rst", ".txt"}
SKIP_PREFIXES = (
    ".git/",
    "frontend/node_modules/",
    ".venv/",
    "backend/.venv/",
)
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\((?P<target>[^)]+)\)")


@dataclass(frozen=True)
class Issue:
    path: str
    message: str

    def render(self) -> str:
        return f"{self.path}: {self.message}"


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _is_active_document(path: Path) -> bool:
    rel = _relative(path)
    return rel in ACTIVE_EXACT or rel.startswith(ACTIVE_PREFIXES)


def _is_repository_document(path: Path) -> bool:
    rel = _relative(path)
    if rel.startswith(SKIP_PREFIXES) or rel.startswith(ARCHIVE_PREFIX):
        return False
    if path.suffix.lower() not in DOCUMENT_SUFFIXES:
        return False
    parts = Path(rel).parts
    return len(parts) == 1 or rel.startswith(("docs/", "backend/docs/", "frontend/"))


def _markdown_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*.md")
        if path.is_file()
        and not _relative(path).startswith(SKIP_PREFIXES)
        and not _relative(path).startswith(ARCHIVE_PREFIX)
    )


def _link_path(source: Path, raw_target: str) -> Path | None:
    target = raw_target.strip().strip("<>")
    if not target or target.startswith(("#", "http://", "https://", "mailto:", "tel:", "data:")):
        return None
    # Optional Markdown title follows a whitespace boundary. Paths in this
    # repository do not intentionally contain unescaped spaces.
    target = target.split(maxsplit=1)[0]
    target = unquote(target.split("#", 1)[0].split("?", 1)[0])
    if not target:
        return None
    if target.startswith("/"):
        return ROOT / target.lstrip("/")
    return (source.parent / target).resolve()


def validate() -> list[Issue]:
    issues: list[Issue] = []

    archive_manifest = ROOT / "docs/archive/README.md"
    if not archive_manifest.is_file():
        issues.append(Issue("docs/archive/", "archive manifest is missing"))

    forbidden_active_dirs = (ROOT / "docs/roadmap",)
    for directory in forbidden_active_dirs:
        if directory.exists():
            issues.append(Issue(_relative(directory), "superseded documentation directory is active"))

    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or not _is_repository_document(path):
            continue
        if not _is_active_document(path):
            issues.append(
                Issue(
                    _relative(path),
                    "unclassified active document; add it to the authority map or archive it",
                )
            )

    for source in _markdown_files():
        text = source.read_text(encoding="utf-8", errors="replace")
        for match in MARKDOWN_LINK.finditer(text):
            resolved = _link_path(source, match.group("target"))
            if resolved is None:
                continue
            try:
                resolved.relative_to(ROOT)
            except ValueError:
                issues.append(
                    Issue(
                        _relative(source),
                        f"local link escapes repository: {match.group('target')!r}",
                    )
                )
                continue
            if not resolved.exists():
                issues.append(
                    Issue(
                        _relative(source),
                        f"broken local link: {match.group('target')!r}",
                    )
                )

    canonical = ROOT / "docs/documentation-index.md"
    if canonical.is_file():
        index_text = canonical.read_text(encoding="utf-8", errors="replace")
        required_fragments = (
            "architecture.md",
            "growth-intelligence-platform.md",
            "faq-intelligence-first-slice.md",
            "../backend/app/core/config/industry_packs/README.md",
            "codex-site-intelligence-wiring-handoff.md",
        )
        for required in required_fragments:
            if required not in index_text:
                issues.append(
                    Issue(
                        _relative(canonical),
                        f"authority index does not reference {required}",
                    )
                )

    return issues


def main() -> int:
    issues = validate()
    if issues:
        print("Documentation validation failed:", file=sys.stderr)
        for issue in issues:
            print(f"- {issue.render()}", file=sys.stderr)
        return 1
    active_count = sum(
        1
        for path in ROOT.rglob("*")
        if path.is_file() and _is_repository_document(path) and _is_active_document(path)
    )
    archived_count = sum(1 for path in (ROOT / "docs/archive").rglob("*") if path.is_file())
    print(f"Documentation boundary valid: {active_count} active documents, {archived_count} archived files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
