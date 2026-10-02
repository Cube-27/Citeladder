"""The committed policy export follows Settings aliases and refuses credentials."""

import os

import pytest
from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from scripts.ts_settings_policy import setting


class ExportSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EXPORT_TEST_")
    plain: str = ""
    aliased: str = Field(default="", validation_alias="EXPORT_PRIMARY_ALIAS")
    choices: str = Field(
        default="", validation_alias=AliasChoices("EXPORT_FIRST", "EXPORT_SECOND")
    )


@pytest.mark.parametrize(
    ("field", "env_name"),
    [
        ("plain", "EXPORT_TEST_PLAIN"),
        ("aliased", "EXPORT_PRIMARY_ALIAS"),
        ("choices", "EXPORT_SECOND"),
    ],
)
def test_exported_environment_lookup_matches_settings(
    monkeypatch: pytest.MonkeyPatch, field: str, env_name: str
) -> None:
    monkeypatch.setenv(env_name, "configured")
    spec = setting(field, ExportSettings)
    resolved = next(
        (os.environ[name] for name in spec["env"] if name in os.environ),
        spec["default"],
    )
    assert resolved == getattr(ExportSettings(_env_file=None), field) == "configured"


@pytest.mark.parametrize("typed_secret", [False, True])
def test_export_refuses_nonempty_typed_or_declared_credential_defaults(
    typed_secret: bool,
) -> None:
    class CredentialSettings(BaseSettings):
        password: str = Field(
            default="credential-fixture", json_schema_extra={"secret": True}
        )
        token: SecretStr = SecretStr("credential-fixture")

    with pytest.raises(ValueError, match="non-empty secret default"):
        setting("token" if typed_secret else "password", CredentialSettings)
