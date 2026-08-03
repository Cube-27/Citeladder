"""Analysis service invariants that do not require a database."""

import uuid

import pytest

from app.analysis.service import _unique_artifact_usage


def test_artifact_usage_requires_one_raw_artifact_per_task() -> None:
    task_id = uuid.uuid4()

    with pytest.raises(RuntimeError, match="multiple raw artifacts"):
        _unique_artifact_usage(
            [(task_id, {"input_tokens": 1}), (task_id, {"input_tokens": 2})]
        )
