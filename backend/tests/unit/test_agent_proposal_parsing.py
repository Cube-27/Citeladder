"""Saved Agent proposals are untrusted inputs to the shared prompt contract."""

import json
import uuid

import pytest

from app.domain.prompts.agent_proposals import parse_proposal
from app.domain.prompts.generation_cells import CellTopic
from app.domain.prompts.generation_errors import GenerationValidationError


def test_proposal_binds_existing_topics_and_rejects_foreign_topics() -> None:
    topic_id, revision_id = uuid.uuid4(), uuid.uuid4()
    topics = [CellTopic(topic_id, "Running shoes", "", None)]
    payload = {
        "prompts": [
            {
                "topic_id": str(topic_id),
                "text": "Which running shoes suit a beginner training on paved roads?",
                "buyer_stage": "consideration",
                "prompt_intent": "recommend",
            }
        ]
    }
    body = "A proposed buying decision.\n```json\n" + json.dumps(payload) + "\n```"
    result = parse_proposal(body, topics, revision_id)
    assert result[0].prompts[0].intent == "purchase"
    assert result[0].prompts[0].evidence_refs[0]["id"] == str(revision_id)
    with pytest.raises(GenerationValidationError, match="topic"):
        parse_proposal(body, [], revision_id)


def test_proposal_never_guesses_from_freeform_text_or_multiple_blocks() -> None:
    with pytest.raises(GenerationValidationError, match="one JSON"):
        parse_proposal("Here are some good questions", [], uuid.uuid4())
