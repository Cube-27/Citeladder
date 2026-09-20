"""Opaque DataForSEO account-pool identity owned by credential handling."""

from __future__ import annotations

import hashlib
import hmac

from app.core.config import settings
from app.core.config.dataforseo import unpack_credential
from app.core.security import decrypt_secret


def dataforseo_account_identity(encrypted_secret: str) -> str:
    """Keyed identity over normalized login; never exposes or logs the login."""
    packed = decrypt_secret(encrypted_secret)
    login = unpack_credential(packed).login.strip().casefold()
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        login.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
