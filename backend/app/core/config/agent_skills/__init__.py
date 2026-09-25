"""File-backed catalog of the Agent's internal skills.

Each skill is one ``skills/<id>/SKILL.md`` methodology with scalar YAML
frontmatter. ``operating_contract.md`` applies to every turn, and
``content_formats.md`` holds one section per content format so a run loads only
the format it writes. This module discovers, parses and validates those files;
it does not interpret their content. The files are production model input, not
coding-agent skills, and are never exposed to users or to MCP.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

SKILL_GROUPS: Final[tuple[str, ...]] = (
    "strategy",
    "demand",
    "owned_site",
    "visibility",
    "content",
)
OUTPUT_KINDS: Final[tuple[str, ...]] = (
    "plan",
    "measurement",
    "research",
    "prompt_portfolio",
    "page_edits",
    "link_plan",
    "technical_fix",
    "diagnosis",
    "earned_brief",
    "content",
)
# Long-form content is outline-first: the first output of these skills is an
# editable outline, and the draft is written only after the user approves it.
OUTLINE_FIRST_OUTPUT_KINDS: Final[frozenset[str]] = frozenset({"content"})
AGENT_SKILL_CATALOG_VERSION: Final = "agent-skills-v1"
_REQUIRED_METADATA: Final = frozenset(
    {"id", "label", "group", "order", "version", "output_kind", "description"}
)
_FORMAT_HEADING: Final = re.compile(r"^## ([a-z_]+) — (.+)$")
_ROOT: Final = Path(__file__).parent


@dataclass(frozen=True)
class AgentSkill:
    """Metadata and methodology from one ``SKILL.md`` file."""

    id: str
    label: str
    group: str
    order: int
    version: int
    output_kind: str
    description: str
    body: str


@dataclass(frozen=True)
class ContentFormat:
    id: str
    label: str
    body: str


def _parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
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


def _load_skill(path: Path) -> AgentSkill:
    metadata, body = _parse_frontmatter(path)
    missing = _REQUIRED_METADATA.difference(metadata)
    if missing:
        raise ValueError(f"{path}: missing metadata {sorted(missing)!r}")
    if path.parent.name != metadata["id"]:
        raise ValueError(f"{path}: skill directory must match skill id")
    if metadata["group"] not in SKILL_GROUPS:
        raise ValueError(f"{path}: unknown group {metadata['group']!r}")
    if metadata["output_kind"] not in OUTPUT_KINDS:
        raise ValueError(f"{path}: unknown output kind {metadata['output_kind']!r}")
    if not body:
        raise ValueError(f"{path}: skill body must not be empty")
    try:
        order = int(metadata["order"])
        version = int(metadata["version"])
    except ValueError as error:
        raise ValueError(f"{path}: order and version must be integers") from error
    if order < 1 or version < 1:
        raise ValueError(f"{path}: order and version must be positive")
    return AgentSkill(
        id=metadata["id"],
        label=metadata["label"],
        group=metadata["group"],
        order=order,
        version=version,
        output_kind=metadata["output_kind"],
        description=metadata["description"],
        body=body,
    )


def _load_registry() -> dict[str, AgentSkill]:
    skills = [_load_skill(path) for path in (_ROOT / "skills").glob("*/SKILL.md")]
    if not skills:
        raise ValueError("agent skill catalog is empty")
    ids = [skill.id for skill in skills]
    orders = [skill.order for skill in skills]
    if len(ids) != len(set(ids)) or len(orders) != len(set(orders)):
        raise ValueError("agent skill ids and orders must be unique")
    return {skill.id: skill for skill in sorted(skills, key=lambda item: item.order)}


def _load_formats(path: Path) -> tuple[str, dict[str, ContentFormat]]:
    text = path.read_text(encoding="utf-8")
    preamble, *sections = re.split(r"\n(?=## )", text)
    formats: dict[str, ContentFormat] = {}
    for section in sections:
        heading, _, body = section.partition("\n")
        match = _FORMAT_HEADING.match(heading)
        if match is None:
            raise ValueError(f"content format heading is invalid: {heading!r}")
        format_id, label = match.groups()
        if format_id in formats:
            raise ValueError(f"duplicate content format {format_id!r}")
        formats[format_id] = ContentFormat(
            id=format_id, label=label.strip(), body=body.strip()
        )
    if not formats:
        raise ValueError("content format reference is empty")
    # The first line is the document title; the rest applies to every format.
    return preamble.partition("\n")[2].strip(), formats


AGENT_SKILL_REGISTRY: Final = _load_registry()
AGENT_SKILL_IDS: Final[tuple[str, ...]] = tuple(AGENT_SKILL_REGISTRY)
OPERATING_CONTRACT: Final = (_ROOT / "operating_contract.md").read_text(
    encoding="utf-8"
)
CONTENT_FORMAT_PREAMBLE, CONTENT_FORMATS = _load_formats(_ROOT / "content_formats.md")
CONTENT_FORMAT_IDS: Final[tuple[str, ...]] = tuple(CONTENT_FORMATS)
