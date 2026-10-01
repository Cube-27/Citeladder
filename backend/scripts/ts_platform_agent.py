"""Export the packaged Agent input policy from its existing configuration owner."""

from typing import Any

from app.core.config import agent_context
from app.core.config import agent_skills as config


def agent_context_policy() -> dict[str, str | int]:
    return {
        name.lower(): value
        for name, value in vars(agent_context).items()
        if name.startswith(("CONTENT_", "CONTEXT_")) and isinstance(value, (str, int))
    }


def agent_skill_policy() -> dict[str, Any]:
    return {
        "groups": config.SKILL_GROUPS,
        "output_kinds": config.OUTPUT_KINDS,
        "outline_first_kinds": sorted(config.OUTLINE_FIRST_OUTPUT_KINDS),
        "format_kinds": sorted(config.CONTENT_FORMAT_OUTPUT_KINDS),
        "description_max_chars": config.SKILL_DESCRIPTION_MAX_CHARS,
        "body_max_chars": config.SKILL_BODY_MAX_CHARS,
        "vocabularies": config.SKILL_VOCABULARIES,
    }
