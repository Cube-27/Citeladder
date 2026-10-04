from __future__ import annotations

import asyncio
from io import StringIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from scripts import provision_dev_login


def test_main_accepts_password_stdin_without_forwarding_an_argument(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = AsyncMock()
    monkeypatch.setattr(provision_dev_login, "_run", run)
    monkeypatch.setattr(
        provision_dev_login.sys, "stdin", StringIO("fixture-password\n")
    )
    assert (
        provision_dev_login.main(
            [
                "--email",
                "dev@example.com",
                "--password-stdin",
                "--counter-allowance",
                "100",
            ]
        )
        == 0
    )
    run.assert_awaited_once_with("dev@example.com", "fixture-password", 100)


@pytest.mark.parametrize(
    "email,password", [("invalid", "fixture-password"), ("dev@example.com", "short")]
)
def test_main_rejects_invalid_credentials_before_provisioning(
    monkeypatch: pytest.MonkeyPatch, email: str, password: str
) -> None:
    run = AsyncMock()
    monkeypatch.setattr(provision_dev_login, "_run", run)
    monkeypatch.setattr(provision_dev_login.sys, "stdin", StringIO(password + "\n"))
    with pytest.raises(SystemExit):
        provision_dev_login.main(
            ["--email", email, "--password-stdin", "--counter-allowance", "100"]
        )
    run.assert_not_called()


class _SessionContext:
    def __init__(self, session: AsyncMock) -> None:
        self.session = session

    async def __aenter__(self) -> AsyncMock:
        return self.session

    async def __aexit__(self, *_args: object) -> None:
        return None


def _arrange_existing_login(monkeypatch: pytest.MonkeyPatch):
    user = SimpleNamespace(id="user-id", email="dev@example.com", role="admin")
    workspace = SimpleNamespace(id="workspace-id")
    account = SimpleNamespace(id="account-id")
    session = AsyncMock()

    monkeypatch.setattr(
        provision_dev_login, "_require_local_development_target", lambda: None
    )
    monkeypatch.setattr(
        provision_dev_login, "SessionLocal", lambda: _SessionContext(session)
    )
    monkeypatch.setattr(
        provision_dev_login, "get_user_by_email", AsyncMock(return_value=user)
    )
    monkeypatch.setattr(
        provision_dev_login,
        "ensure_personal_workspace",
        AsyncMock(return_value=workspace),
    )
    monkeypatch.setattr(
        provision_dev_login, "ensure_workspace_billing", AsyncMock(return_value=account)
    )
    monkeypatch.setattr(provision_dev_login, "issue_development_access", AsyncMock())
    dispose_engine = AsyncMock()
    monkeypatch.setattr(provision_dev_login, "dispose_engine", dispose_engine)
    return user, session, dispose_engine


def test_run_verifies_credentials_in_the_provisioning_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, session, dispose_engine = _arrange_existing_login(monkeypatch)
    authenticate_user = AsyncMock(return_value=("token", user))
    monkeypatch.setattr(provision_dev_login, "authenticate_user", authenticate_user)

    asyncio.run(provision_dev_login._run(user.email, "password123", 100))

    session.commit.assert_awaited_once()
    authenticate_user.assert_awaited_once_with(session, user.email, "password123")
    dispose_engine.assert_awaited_once()


def test_run_fails_when_written_credentials_do_not_authenticate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _session, dispose_engine = _arrange_existing_login(monkeypatch)
    monkeypatch.setattr(
        provision_dev_login, "authenticate_user", AsyncMock(return_value=None)
    )

    with pytest.raises(RuntimeError, match="credentials did not authenticate"):
        asyncio.run(provision_dev_login._run(user.email, "wrong-password", 100))

    dispose_engine.assert_awaited_once()


def test_run_rejects_non_admin_returned_by_registration_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _session, dispose_engine = _arrange_existing_login(monkeypatch)
    user.role = "user"
    get_user = AsyncMock(side_effect=[None, user])
    monkeypatch.setattr(provision_dev_login, "get_user_by_email", get_user)
    monkeypatch.setattr(
        provision_dev_login, "register_user", AsyncMock(return_value=None)
    )

    with pytest.raises(RuntimeError, match="not an admin account"):
        asyncio.run(provision_dev_login._run(user.email, "password123", 100))

    dispose_engine.assert_awaited_once()


def test_run_preserves_missing_user_failure_after_registration_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _session, dispose_engine = _arrange_existing_login(monkeypatch)
    monkeypatch.setattr(
        provision_dev_login,
        "get_user_by_email",
        AsyncMock(side_effect=[None, None]),
    )
    monkeypatch.setattr(
        provision_dev_login, "register_user", AsyncMock(return_value=None)
    )

    with pytest.raises(RuntimeError, match="registration did not persist"):
        asyncio.run(provision_dev_login._run(user.email, "password123", 100))

    dispose_engine.assert_awaited_once()
