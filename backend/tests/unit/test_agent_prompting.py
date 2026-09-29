"""Pure model-output rules: outline-first admission and citation stripping."""

from __future__ import annotations

from app.core.config.agent import (
    AGENT_REPLY_MAX_CHARS,
    AGENT_TRANSCRIPT_MAX_CHARS,
    RUN_MODE_DRAFT_FROM_OUTLINE,
    RUN_MODE_TURN,
)
from app.core.config.agent_skills import AGENT_SKILL_REGISTRY
from app.domain.agent.prompting import (
    REPLY_TRUNCATED_MARKER,
    UNVERIFIED_REF_PLACEHOLDER,
    TurnState,
    bound_reply,
    outline_required,
    strip_unverified_refs,
    user_text,
)

_CONTENT = AGENT_SKILL_REGISTRY["content_create"]
_PLAN = AGENT_SKILL_REGISTRY["growth_plan"]
_PROMPTS = AGENT_SKILL_REGISTRY["prompt_discovery"]


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


def test_a_prompt_portfolio_starts_as_a_coverage_plan_to_approve() -> None:
    assert outline_required(_PROMPTS, None, RUN_MODE_TURN)
    assert not outline_required(
        _PROMPTS, _output("outline", approved=True), RUN_MODE_TURN
    )


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


def _state(*, body: str, steps: list[str]) -> TurnState:
    return TurnState(
        context_text="Business context.",
        history=[],
        request="Rewrite the pricing page.",
        current_output={
            "number": 1,
            "phase": "draft",
            "title": "t",
            "body": body,
            "outline_approved": True,
        },
        mode=RUN_MODE_TURN,
        steps=steps,
    )


def test_a_long_transcript_keeps_its_head_and_the_newest_steps() -> None:
    steps = [f"Step {n}: " + "x" * 2_000 for n in range(60)]

    text = user_text(_state(body="Draft.", steps=steps))

    assert len(text) <= AGENT_TRANSCRIPT_MAX_CHARS
    assert "Rewrite the pricing page." in text
    assert "[earlier steps truncated]" in text
    assert text.endswith(steps[-1])


def test_a_head_that_fills_the_bound_carries_no_step_text() -> None:
    # A near-maximal output leaves no room; the steps must not be re-appended
    # wholesale (a non-positive slice bound would keep the entire transcript).
    body = "y" * AGENT_TRANSCRIPT_MAX_CHARS
    steps = [f"Step {n}: " + "z" * 1_000 for n in range(10)]

    text = user_text(_state(body=body, steps=steps))

    assert "Rewrite the pricing page." in text
    assert "z" * 1_000 not in text
