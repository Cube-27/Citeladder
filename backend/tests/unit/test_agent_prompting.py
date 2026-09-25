"""Pure model-output rules: outline-first admission and citation stripping."""

from __future__ import annotations

from app.core.config.agent import (
    AGENT_REPLY_MAX_CHARS,
    RUN_MODE_DRAFT_FROM_OUTLINE,
    RUN_MODE_TURN,
)
from app.core.config.agent_skills import AGENT_SKILL_REGISTRY
from app.domain.agent.prompting import (
    REPLY_TRUNCATED_MARKER,
    UNVERIFIED_REF_PLACEHOLDER,
    bound_reply,
    outline_required,
    strip_unverified_refs,
)

_CONTENT = AGENT_SKILL_REGISTRY["content_create"]
_PLAN = AGENT_SKILL_REGISTRY["growth_plan"]


def _output(phase: str, *, approved: bool) -> dict[str, object]:
    return {
        "number": 1,
        "phase": phase,
        "title": "t",
        "body": "b",
        "outline_approved": approved,
    }


def test_long_form_needs_an_approved_outline_whatever_the_phase() -> None:
    # A final/draft phase reached without an approval (another kind's output,
    # a restored revision) must not unlock a draft.
    assert outline_required(_CONTENT, None, RUN_MODE_TURN)
    assert outline_required(_CONTENT, _output("final", approved=False), RUN_MODE_TURN)
    assert not outline_required(
        _CONTENT, _output("draft", approved=True), RUN_MODE_TURN
    )
    assert not outline_required(
        _CONTENT, _output("outline", approved=False), RUN_MODE_DRAFT_FROM_OUTLINE
    )
    assert not outline_required(_PLAN, None, RUN_MODE_TURN)


def test_only_returned_record_references_survive_in_visible_text() -> None:
    known = "citeladder://opportunity/11111111-1111-4111-8111-111111111111"
    invented = "citeladder://opportunity/22222222-2222-4222-8222-222222222222"
    text = f"See {known}. Also ({invented}), and [{invented}]."

    cleaned = strip_unverified_refs(text, {known})

    assert cleaned == (
        f"See {known}. Also ({UNVERIFIED_REF_PLACEHOLDER}), "
        f"and [{UNVERIFIED_REF_PLACEHOLDER}]."
    )


def test_an_oversized_reply_is_cut_at_its_bound_and_says_so() -> None:
    short = "x" * AGENT_REPLY_MAX_CHARS
    assert bound_reply(short) == short

    cut = bound_reply(short + "overflow")

    assert cut == short + REPLY_TRUNCATED_MARKER
