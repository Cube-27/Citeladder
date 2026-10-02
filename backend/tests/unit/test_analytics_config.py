"""Shared deployment referral-secret contract."""

from __future__ import annotations

import pytest

from app.core.config import INSECURE_SECRET_DEFAULTS, Settings


def test_referral_hash_salt_env_injected_with_insecure_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A developer's real salt must not leak into this test.
    monkeypatch.delenv("REFERRAL_HASH_SALT", raising=False)
    fresh = Settings(_env_file=None)
    # Ships an insecure placeholder that the startup secret check flags
    # (same pattern as jwt_secret_key / encryption_key).
    assert fresh.referral_hash_salt in INSECURE_SECRET_DEFAULTS
    monkeypatch.setenv("REFERRAL_HASH_SALT", "test-salt-value")
    configured = Settings(_env_file=None)
    assert configured.referral_hash_salt == "test-salt-value"
