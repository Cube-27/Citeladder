"""Safe shared error summaries retained for Agent and application models."""

from app.connectors.answer_engines.errors import safe_error_detail


def test_anthropic_safe_error_detail_extracts_type_and_message() -> None:
    body = {
        "type": "error",
        "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the API.",
        },
    }
    assert safe_error_detail(body) == (
        "invalid_request_error: Your credit balance is too low to access the API."
    )
    # Malformed / empty bodies degrade to an empty string, never raise.
    assert safe_error_detail({}) == ""
    assert safe_error_detail({"error": "not-a-dict"}) == ""
    # Non-dict top-level payloads degrade the same way.
    assert safe_error_detail([]) == ""
    assert safe_error_detail("oops") == ""
    # Oversized messages are length-capped.
    long_body = {"error": {"type": "api_error", "message": "x" * 10_000}}
    assert len(safe_error_detail(long_body)) < 300
