from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


@pytest.fixture
def retention() -> ModuleType:
    path = Path(__file__).parents[3] / "infra/gcp/runtime/retain-images.py"
    spec = importlib.util.spec_from_file_location("deployment_retention", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_selection_preserves_rollback_containers_and_unowned_images(
    retention: ModuleType,
) -> None:
    registry = "region-docker.pkg.dev/project/citeladder-demo"

    def image(name: str, repository: str = "backend") -> dict:
        return {
            "Id": name,
            "RepoTags": [],
            "RepoDigests": [f"{registry}/{repository}@sha256:{name}"],
        }

    old = image("old", "frontend")
    current = image("current")
    rollback = image("rollback")
    stopped = image("stopped")
    foreign = image("foreign", "another-app")
    shared = image("shared")
    shared["RepoTags"] = ["another-owner:keep"]
    dangling = {"Id": "dangling", "RepoTags": None, "RepoDigests": None}
    protected = {current["RepoDigests"][0], rollback["RepoDigests"][0]}

    assert retention.removable_images(
        [old, current, rollback, stopped, foreign, shared, dangling],
        protected,
        {"stopped"},
        registry,
    ) == [old]


def test_rollback_configuration_ignores_exported_candidate_image(
    retention: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BACKEND_IMAGE", "candidate")
    for suffix, reference in (("", "candidate"), (".previous", "rollback")):
        (tmp_path / f"runtime.env{suffix}").write_text(f"BACKEND_IMAGE={reference}\n")
        (tmp_path / f"compose.gcp.yml{suffix}").write_text("services: {}\n")

    def docker(*arguments: str, environment: dict) -> str:
        assert "BACKEND_IMAGE" not in environment
        env_file = Path(arguments[2])
        return env_file.read_text().strip().split("=", 1)[1]

    monkeypatch.setattr(retention, "docker", docker)
    assert retention.deployment_images(tmp_path) == {"candidate", "rollback"}
    (tmp_path / "compose.gcp.yml.previous").unlink()
    with pytest.raises(RuntimeError, match="Incomplete deployment"):
        retention.deployment_images(tmp_path)


@pytest.mark.parametrize("apply", [False, True])
def test_retention_preview_and_apply_use_only_scoped_image_removal(
    retention: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    apply: bool,
) -> None:
    reference = "region-docker.pkg.dev/project/citeladder-demo/backend@sha256:old"
    calls = []

    def docker(*arguments: str) -> str:
        calls.append(arguments)
        if arguments[:2] == ("image", "ls"):
            return "old"
        if arguments[:2] == ("image", "inspect"):
            return json.dumps([{"Id": "old", "RepoDigests": [reference]}])
        return ""

    monkeypatch.setattr(retention, "deployment_images", lambda directory: {"candidate"})
    monkeypatch.setattr(retention, "docker", docker)
    assert (
        retention.retain(
            tmp_path,
            "region-docker.pkg.dev/project/citeladder-demo",
            apply,
        )
        == 1
    )
    mutations = [call for call in calls if call[:2] == ("image", "rm")]
    assert mutations == ([("image", "rm", reference)] if apply else [])


def test_low_disk_space_blocks_deployment(
    retention: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(retention, "docker", lambda *args: "/docker-data")
    monkeypatch.setattr(
        retention.shutil, "disk_usage", lambda path: SimpleNamespace(free=10)
    )
    with pytest.raises(RuntimeError, match="deployment requires 11"):
        retention.require_space(11)
    retention.require_space(10)
