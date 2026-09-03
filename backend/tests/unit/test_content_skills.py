"""File-backed content-skill catalog tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config.content import (
    CONTENT_DEFAULT_SKILL,
    CONTENT_SKILL_CATALOG_VERSION,
    CONTENT_SKILL_IDS,
    CONTENT_SKILL_REGISTRY,
    CONTENT_SKILLS,
    skill_body,
    skill_version,
)
from app.core.config.content_skills import CONTENT_CHANNELS, _load_skill
from app.domain.content.schemas import ContentGenerationCreate, skill_catalog

_EXPECTED_SKILL_IDS = (
    "content_page",
    "product_page",
    "category_page",
    "about_us",
    "article",
    "blog",
    "faq",
    "comparison",
    "listicle",
    "case_study",
    "glossary_term",
    "linkedin",
    "x",
    "instagram",
    "youtube",
    "tiktok",
    "reddit",
    "newsletter",
)


def test_file_backed_catalog_has_the_complete_ordered_skill_set() -> None:
    assert CONTENT_SKILL_IDS == _EXPECTED_SKILL_IDS
    assert CONTENT_SKILLS == frozenset(_EXPECTED_SKILL_IDS)
    assert CONTENT_DEFAULT_SKILL == "content_page"
    assert CONTENT_SKILL_CATALOG_VERSION == "content-skills-v5"


def test_every_skill_has_file_metadata_and_an_authored_body() -> None:
    for expected_order, skill in enumerate(CONTENT_SKILL_REGISTRY.values(), start=1):
        assert skill.channel in CONTENT_CHANNELS
        assert skill.order == expected_order
        assert skill.version >= 1
        assert skill.description
        assert skill.body.startswith("## Purpose\n")
        assert "```yaml" not in skill.body


def test_selected_skill_body_is_returned_verbatim_and_deterministically() -> None:
    skill = CONTENT_SKILL_REGISTRY["about_us"]
    assert skill_body("about_us") == skill.body
    assert "Direct company/organization and offering definition." in skill.body
    assert skill_body("does-not-exist") == skill_body(CONTENT_DEFAULT_SKILL)


def test_skill_version_describes_the_body_skill_body_returns() -> None:
    """Provenance must name the pack that was actually rendered.

    ``skill_version`` is stored beside ``message_digest`` to answer "what
    produced this output?". The digest is computed over the messages actually
    built, so it agrees with itself even when the version names a different
    pack — nothing detects a mismatch here except this. The unknown-id case is
    the sharp edge: ``skill_body`` silently serves the default pack, so the
    version has to fall back the same way or it describes a body never sent.
    """
    for skill_id, skill in CONTENT_SKILL_REGISTRY.items():
        assert skill_body(skill_id) == skill.body
        assert skill_version(skill_id) == skill.version

    default = CONTENT_SKILL_REGISTRY[CONTENT_DEFAULT_SKILL]
    assert skill_version("does-not-exist") == default.version
    assert skill_version(None) == default.version


def test_loader_rejects_a_pack_with_invalid_required_metadata(tmp_path: Path) -> None:
    path = tmp_path / "missing" / "SKILL.md"
    path.parent.mkdir()
    path.write_text("---\nid: missing\n---\n\n## Purpose\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing metadata"):
        _load_skill(path)


def test_loader_rejects_a_pack_outside_its_id_directory(tmp_path: Path) -> None:
    path = tmp_path / "wrong" / "SKILL.md"
    path.parent.mkdir()
    path.write_text(
        "---\nid: right\nlabel: Right\nchannel: web\norder: 1\nversion: 1\n"
        "description: A pack.\n---\n\n## Purpose\n\nBody.\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="pack directory must match skill id"):
        _load_skill(path)


def test_catalog_projection_exposes_metadata_without_the_skill_body() -> None:
    catalog = skill_catalog()
    assert [skill.id for skill in catalog.skills] == list(CONTENT_SKILL_IDS)
    assert catalog.default_skill_id == CONTENT_DEFAULT_SKILL
    for skill in catalog.skills:
        assert skill.description
        assert not hasattr(skill, "body")


def test_create_rejects_a_skill_outside_the_catalog() -> None:
    with pytest.raises(ValueError):
        ContentGenerationCreate(
            project_id="00000000-0000-0000-0000-000000000001",
            user_instruction="Write something",
            skill_id="not-a-skill",
        )


def test_create_accepts_a_file_backed_skill() -> None:
    payload = ContentGenerationCreate(
        project_id="00000000-0000-0000-0000-000000000001",
        user_instruction="Write something",
        skill_id="product_page",
    )
    assert payload.skill_id == "product_page"
