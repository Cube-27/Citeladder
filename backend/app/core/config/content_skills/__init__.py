"""File-backed content-skill catalog.

Skill metadata and authored craft guidance share one ``SKILL.md`` file.  This
module intentionally only discovers, parses, validates, and projects those
files; it does not interpret or reproduce their content.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

CHANNEL_WEB: Final = "web"
CHANNEL_SOCIAL: Final = "social"
CHANNEL_VIDEO: Final = "video"
CHANNEL_COMMUNITY: Final = "community"
CHANNEL_EMAIL: Final = "email"
CONTENT_CHANNELS: Final[tuple[str, ...]] = (
    CHANNEL_WEB,
    CHANNEL_SOCIAL,
    CHANNEL_VIDEO,
    CHANNEL_COMMUNITY,
    CHANNEL_EMAIL,
)
CONTENT_DEFAULT_SKILL: Final = "content_page"
CONTENT_SKILL_CATALOG_VERSION: Final = "content-skills-v5"
_REQUIRED_METADATA: Final = frozenset(
    {"id", "label", "channel", "order", "version", "description"}
)


@dataclass(frozen=True)
class ContentSkill:
    """Metadata and authored craft instructions from one ``SKILL.md`` file."""

    id: str
    label: str
    channel: str
    order: int
    version: int
    description: str
    body: str


def _parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    """Read the deliberately scalar YAML frontmatter used by skill packs."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: missing YAML frontmatter")
    try:
        frontmatter, body = text[4:].split("\n---\n", maxsplit=1)
    except ValueError as error:
        raise ValueError(f"{path}: unterminated YAML frontmatter") from error

    metadata: dict[str, str] = {}
    for line in frontmatter.splitlines():
        key, separator, value = line.partition(":")
        if not separator or not key or not value.startswith(" "):
            raise ValueError(f"{path}: invalid frontmatter line {line!r}")
        if key in metadata:
            raise ValueError(f"{path}: duplicate frontmatter key {key!r}")
        metadata[key] = value.strip()
    return metadata, body.strip()


def _load_skill(path: Path) -> ContentSkill:
    metadata, body = _parse_frontmatter(path)
    missing = _REQUIRED_METADATA.difference(metadata)
    if missing:
        raise ValueError(f"{path}: missing metadata {sorted(missing)!r}")
    if metadata["channel"] not in CONTENT_CHANNELS:
        raise ValueError(f"{path}: unknown channel {metadata['channel']!r}")
    if path.parent.name != metadata["id"]:
        raise ValueError(f"{path}: pack directory must match skill id")
    if not body:
        raise ValueError(f"{path}: skill body must not be empty")
    try:
        order = int(metadata["order"])
        version = int(metadata["version"])
    except ValueError as error:
        raise ValueError(f"{path}: order and version must be integers") from error
    if order < 1 or version < 1:
        raise ValueError(f"{path}: order and version must be positive")
    return ContentSkill(
        id=metadata["id"],
        label=metadata["label"],
        channel=metadata["channel"],
        order=order,
        version=version,
        description=metadata["description"],
        body=body,
    )


def _load_registry() -> dict[str, ContentSkill]:
    packs = Path(__file__).parent / "packs"
    skills = [_load_skill(path) for path in packs.glob("*/SKILL.md")]
    if not skills:
        raise ValueError("content skill catalog has no packs")
    ids = [skill.id for skill in skills]
    orders = [skill.order for skill in skills]
    if len(ids) != len(set(ids)):
        raise ValueError("content skill catalog contains duplicate ids")
    if len(orders) != len(set(orders)):
        raise ValueError("content skill catalog contains duplicate orders")
    ordered_skills = sorted(skills, key=lambda skill: skill.order)
    registry = {skill.id: skill for skill in ordered_skills}
    if CONTENT_DEFAULT_SKILL not in registry:
        raise ValueError("content skill catalog is missing its default skill")
    return registry


CONTENT_SKILL_REGISTRY: Final = _load_registry()
CONTENT_SKILL_IDS: Final[tuple[str, ...]] = tuple(CONTENT_SKILL_REGISTRY)
CONTENT_SKILLS: Final[frozenset[str]] = frozenset(CONTENT_SKILL_IDS)


def _skill(skill_id: str | None):
    """The selected pack, falling back to the default for an unknown id."""
    return CONTENT_SKILL_REGISTRY.get(
        skill_id or CONTENT_DEFAULT_SKILL,
        CONTENT_SKILL_REGISTRY[CONTENT_DEFAULT_SKILL],
    )


def skill_body(skill_id: str | None) -> str:
    """Return the selected authored skill body, defaulting for unknown ids."""
    return _skill(skill_id).body


def skill_version(skill_id: str | None) -> int:
    """The version of the pack ``skill_body`` would return for the same id.

    Provenance must name the body that was actually rendered, so the version
    is resolved through the same lookup and the same fallback — including the
    unknown-id case, where ``skill_body`` silently serves the default pack and
    a version taken from the requested id would describe a different one.
    """
    return _skill(skill_id).version
