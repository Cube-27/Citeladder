from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.export_openapi import export_openapi


def test_export_openapi_writes_the_remaining_fastapi_health_contract(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    output = tmp_path / "nested" / "openapi.json"

    export_openapi(output)

    document = json.loads(output.read_text(encoding="utf-8"))
    assert document["info"]["title"] == "CiteLadder"
    assert set(document["paths"]) == {"/health", "/ready"}
    assert document["paths"]["/health"]["get"]["responses"]["200"]


def test_export_openapi_rejects_output_outside_the_workspace(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.chdir(workspace)

    with pytest.raises(ValueError, match="must stay within"):
        export_openapi(tmp_path / "openapi.json")
