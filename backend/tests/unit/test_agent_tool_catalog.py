"""Model-facing argument and bounded-result contracts."""

import uuid

import pytest
from jsonschema import Draft202012Validator

from app.domain.agent.tool_catalog import (
    ToolRefusedError,
    build_agent_tools,
    execute_tool,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("name", "valid", "invalid"),
    [
        (
            "get_project_business_context",
            {"sections": ["profile", "prompts", "visibility"]},
            {"sections": ["business_profile", "prompt_portfolio", "visibility_audit"]},
        ),
        ("read_prompt_portfolio", {"limit": 200}, {"limit": 1000}),
        ("read_prompt_portfolio", {"limit": 1}, {"limit": 0}),
        ("read_prompt_portfolio", {"limit": None}, {"limit": True}),
    ],
)
async def test_advertised_constraints_refuse_bad_calls_before_database_access(
    name: str,
    valid: dict,
    invalid: dict,
) -> None:
    def no_session():
        pytest.fail("invalid arguments must be refused before opening a session")

    tool = build_agent_tools(no_session)[name]
    schema = Draft202012Validator(tool.schema())
    assert schema.is_valid(valid)
    assert not schema.is_valid(invalid)
    with pytest.raises(ToolRefusedError):
        await execute_tool(
            tool,
            project_id=uuid.uuid4(),
            member_user_id=uuid.uuid4(),
            arguments=invalid,
        )
