from __future__ import annotations

import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from tests.unit.test_reset_db import _reset_module


@pytest.mark.parametrize(
    "catalog_status,diagnostic,visible",
    [
        (0, "", False),
        (1, "active_admin_required", True),
        (1, "fixture sensitive value", False),
    ],
)
def test_reset_sequences_identity_before_catalog_and_fails_on_catalog_error(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    catalog_status: int,
    diagnostic: str,
    visible: bool,
) -> None:
    module = _reset_module()
    monkeypatch.setattr(module.shutil, "which", lambda _name: "/fixture/bin/node")
    monkeypatch.setattr(
        module,
        "_configuration",
        lambda: {
            "APP_ENV": "development",
            "DEV_LOGIN_EMAIL": "dev@example.test",
            "DEV_LOGIN_PASSWORD": "fixture-password",
            "DEV_LOGIN_COUNTER_ALLOWANCE": "100",
        },
    )
    run = Mock(
        side_effect=[
            SimpleNamespace(returncode=0, stdout="identity ready", stderr=""),
            SimpleNamespace(
                returncode=catalog_status, stdout="catalog ready", stderr=diagnostic
            ),
        ]
    )
    monkeypatch.setattr(module.subprocess, "run", run)
    if catalog_status:
        with pytest.raises(SystemExit):
            module.provision_dev_login(
                "postgresql+asyncpg://postgres:fixture@localhost/disposable"
            )
    else:
        module.provision_dev_login(
            "postgresql+asyncpg://postgres:fixture@localhost/disposable"
        )
    first, second = run.call_args_list
    assert first.args[0][2] == "scripts.provision_dev_login"
    assert "fixture-password" not in first.args[0]
    assert first.kwargs["input"] == "fixture-password\n"
    assert second.args[0][0] == "/fixture/bin/node"
    assert second.kwargs["env"]["DATABASE_URL"] == first.kwargs["env"]["DATABASE_URL"]
    errors = capsys.readouterr().err.splitlines()
    assert (diagnostic in errors) is visible


def test_reset_does_not_initialize_catalog_when_identity_times_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _reset_module()
    monkeypatch.setattr(
        module,
        "_configuration",
        lambda: {
            "APP_ENV": "development",
            "DEV_LOGIN_EMAIL": "dev@example.test",
            "DEV_LOGIN_PASSWORD": "fixture",
            "DEV_LOGIN_COUNTER_ALLOWANCE": "100",
        },
    )
    run = Mock(side_effect=subprocess.TimeoutExpired("identity", 1))
    monkeypatch.setattr(module.subprocess, "run", run)
    with pytest.raises(SystemExit):
        module.provision_dev_login(
            "postgresql+asyncpg://postgres:fixture@localhost/disposable"
        )
    assert run.call_count == 1
