"""Loader decisions for the Agent's file-backed skill catalog."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config.agent_skills import _load_formats, _load_skill

_VALID_FRONTMATTER = (
    "---\nid: {id}\nlabel: Label\ngroup: strategy\norder: 1\nversion: 1\n"
    "output_kind: {kind}\ndescription: A skill.\n---\n\n# Body\n\nMethod.\n"
)


def _write_skill(root: Path, directory: str, *, skill_id: str, kind: str) -> Path:
    path = root / directory / "SKILL.md"
    path.parent.mkdir()
    path.write_text(_VALID_FRONTMATTER.format(id=skill_id, kind=kind), encoding="utf-8")
    return path


def test_loader_parses_a_valid_skill(tmp_path: Path) -> None:
    skill = _load_skill(_write_skill(tmp_path, "plan", skill_id="plan", kind="plan"))

    assert (skill.id, skill.output_kind, skill.version) == ("plan", "plan", 1)
    assert skill.body == "# Body\n\nMethod."


def test_loader_rejects_missing_metadata(tmp_path: Path) -> None:
    path = tmp_path / "missing" / "SKILL.md"
    path.parent.mkdir()
    path.write_text("---\nid: missing\n---\n\nBody\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing metadata"):
        _load_skill(path)


def test_loader_rejects_a_skill_outside_its_id_directory(tmp_path: Path) -> None:
    path = _write_skill(tmp_path, "wrong", skill_id="right", kind="plan")

    with pytest.raises(ValueError, match="directory must match"):
        _load_skill(path)


def test_loader_rejects_an_unknown_output_kind(tmp_path: Path) -> None:
    path = _write_skill(tmp_path, "plan", skill_id="plan", kind="podcast")

    with pytest.raises(ValueError, match="unknown output kind"):
        _load_skill(path)


def test_format_sections_are_keyed_by_id_with_a_shared_preamble(
    tmp_path: Path,
) -> None:
    path = tmp_path / "formats.md"
    path.write_text(
        "# Formats\n\nShared rule.\n\n## faq — FAQ page\n\nAnswer first.\n\n"
        "## blog — Blog post\n\nBe practical.\n",
        encoding="utf-8",
    )

    preamble, formats = _load_formats(path)

    assert preamble == "Shared rule."
    assert list(formats) == ["faq", "blog"]
    assert (formats["faq"].label, formats["faq"].body) == ("FAQ page", "Answer first.")


def test_format_loader_rejects_a_heading_without_an_id(tmp_path: Path) -> None:
    path = tmp_path / "formats.md"
    path.write_text("# Formats\n\n## FAQ page\n\nAnswer first.\n", encoding="utf-8")

    with pytest.raises(ValueError, match="heading is invalid"):
        _load_formats(path)
