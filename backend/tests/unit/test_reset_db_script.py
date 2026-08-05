from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[3] / "reset-db.py"


def _load_reset_db_module():
    spec = importlib.util.spec_from_file_location("reset_db", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_database_url_falls_back_to_docker_env(monkeypatch, tmp_path: Path) -> None:
    reset_db = _load_reset_db_module()
    docker_env = tmp_path / "docker.env"
    docker_env.write_text(
        "DATABASE_URL=postgresql+asyncpg://user:password@127.0.0.1:55432/app\n",
        encoding="utf-8",
    )

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(reset_db, "DOCKER_ENV_FILE", docker_env)
    monkeypatch.setattr(reset_db, "PROJECT_ROOT", tmp_path / "missing-root")
    monkeypatch.setattr(reset_db, "BACKEND_DIR", tmp_path / "missing-backend")

    assert reset_db._database_url().endswith("@127.0.0.1:55432/app")


def test_database_url_is_derived_from_docker_postgres_components(
    monkeypatch, tmp_path: Path
) -> None:
    reset_db = _load_reset_db_module()
    docker_env = tmp_path / "docker.env"
    docker_env.write_text(
        "\n".join(
            (
                "POSTGRES_USER=postgres",
                "POSTGRES_PASSWORD=password!with@symbols",
                "POSTGRES_DB=citeladder",
                "POSTGRES_HOST=127.0.0.1",
                "POSTGRES_HOST_PORT=55432",
                "DATABASE_URL=postgresql://stale:stale@localhost/stale",
            )
        ),
        encoding="utf-8",
    )

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(reset_db, "DOCKER_ENV_FILE", docker_env)
    monkeypatch.setattr(reset_db, "PROJECT_ROOT", tmp_path / "missing-root")
    monkeypatch.setattr(reset_db, "BACKEND_DIR", tmp_path / "missing-backend")

    assert reset_db._database_url() == (
        "postgresql+asyncpg://postgres:password%21with%40symbols"
        "@127.0.0.1:55432/citeladder"
    )


def test_database_url_environment_has_highest_precedence(
    monkeypatch, tmp_path: Path
) -> None:
    reset_db = _load_reset_db_module()
    docker_env = tmp_path / "docker.env"
    docker_env.write_text(
        "DATABASE_URL=postgresql+asyncpg://user:password@docker:5432/app\n",
        encoding="utf-8",
    )
    environment_url = "postgresql+asyncpg://user:password@localhost:55432/app"

    monkeypatch.setenv("DATABASE_URL", environment_url)
    monkeypatch.setattr(reset_db, "DOCKER_ENV_FILE", docker_env)

    assert reset_db._database_url() == environment_url


def test_database_url_reports_every_supported_source(
    monkeypatch, tmp_path: Path
) -> None:
    reset_db = _load_reset_db_module()
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(reset_db, "DOCKER_ENV_FILE", tmp_path / "missing-docker.env")
    monkeypatch.setattr(reset_db, "PROJECT_ROOT", tmp_path / "missing-root")
    monkeypatch.setattr(reset_db, "BACKEND_DIR", tmp_path / "missing-backend")

    with pytest.raises(RuntimeError, match=r"infra/docker/\.env"):
        reset_db._database_url()


def test_development_reset_requires_dev_login_configuration(
    monkeypatch, tmp_path: Path
) -> None:
    reset_db = _load_reset_db_module()
    monkeypatch.setattr(reset_db, "DOCKER_ENV_FILE", tmp_path / "missing-docker.env")
    monkeypatch.setattr(reset_db, "PROJECT_ROOT", tmp_path / "missing-root")
    monkeypatch.setattr(reset_db, "BACKEND_DIR", tmp_path / "missing-backend")
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("DEV_LOGIN_EMAIL", raising=False)
    monkeypatch.delenv("DEV_LOGIN_PASSWORD", raising=False)
    monkeypatch.delenv("DEV_LOGIN_COUNTER_ALLOWANCE", raising=False)

    with pytest.raises(RuntimeError, match="DEV_LOGIN_EMAIL"):
        reset_db.provision_dev_login("postgresql://localhost/app")
