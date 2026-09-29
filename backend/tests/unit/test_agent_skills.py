"""Loader decisions for the Agent's file-backed skill catalog."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core.config import agent_skills
from app.core.config.agent_skills import (
    AGENT_SKILL_REGISTRY,
    OPERATING_CONTRACT,
    SKILL_BODY_MAX_CHARS,
    SKILL_VOCABULARIES,
    _load_formats,
    _load_skill,
)
from app.domain.agent.tool_catalog import build_agent_tools

_VALID_FRONTMATTER = (
    "---\nid: {id}\nlabel: Label\ngroup: strategy\norder: 1\nversion: 1\n"
    "output_kind: {kind}\ndescription: A skill.\n---\n\n# Body\n\nMethod.\n"
)


def _write_skill(
    root: Path, directory: str, *, skill_id: str, kind: str, body: str = ""
) -> Path:
    path = root / directory / "SKILL.md"
    path.parent.mkdir()
    text = _VALID_FRONTMATTER.format(id=skill_id, kind=kind)
    path.write_text(text + body, encoding="utf-8")
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


def test_a_declared_vocabulary_is_expanded_from_its_owner(tmp_path: Path) -> None:
    path = _write_skill(
        tmp_path, "plan", skill_id="plan", kind="plan", body="Stages: {{buyer_stages}}."
    )

    skill = _load_skill(path)

    assert f"Stages: {', '.join(SKILL_VOCABULARIES['buyer_stages'])}." in skill.body


def test_loader_rejects_an_unknown_vocabulary(tmp_path: Path) -> None:
    path = _write_skill(
        tmp_path, "plan", skill_id="plan", kind="plan", body="{{buyer_moods}}"
    )

    with pytest.raises(ValueError, match="unknown vocabulary"):
        _load_skill(path)


def test_loader_bounds_the_body_that_reaches_every_step(tmp_path: Path) -> None:
    path = _write_skill(
        tmp_path, "plan", skill_id="plan", kind="plan", body="x" * SKILL_BODY_MAX_CHARS
    )

    with pytest.raises(ValueError, match="the bound is"):
        _load_skill(path)


def test_every_tool_the_packaged_skills_name_is_offered_to_the_agent() -> None:
    # A renamed or retired read would otherwise leave a methodology telling
    # the model to call a tool the runtime refuses as unknown.
    offered = set(build_agent_tools(lambda: None))  # type: ignore[arg-type,return-value]
    texts = [OPERATING_CONTRACT, *(s.body for s in AGENT_SKILL_REGISTRY.values())]
    named = {
        name
        for text in texts
        for name in re.findall(r"`((?:read|list|get)_[a-z_]+)`", text)
    }

    assert named, "the packaged skills name no tools"
    assert named <= offered, sorted(named - offered)


def test_catalog_version_tracks_expanded_vocabulary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = agent_skills._catalog_version()
    monkeypatch.setitem(SKILL_VOCABULARIES, "buyer_stages", ("changed_stage",))

    assert agent_skills._catalog_version() != original
