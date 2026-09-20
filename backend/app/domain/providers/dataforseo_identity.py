"""Opaque DataForSEO account-pool identity owned by credential handling."""

from __future__ import annotations

import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings
from app.core.config.dataforseo import unpack_credential
from app.core.security import decrypt_secret


def dataforseo_account_identity(encrypted_secret: str) -> str:
    """Keyed identity over normalized login; never exposes or logs the login."""
    packed = decrypt_secret(encrypted_secret)
    login = unpack_credential(packed).login.strip().casefold()
    identity_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"citeladder:dataforseo:account-identity:v1",
    ).derive(settings.encryption_key.encode("utf-8"))
    return hmac.new(
        identity_key,
        login.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
