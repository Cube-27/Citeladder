"""OAuth connect contract surface for the Integrations owner.

Exceptions raised across the connect flow (``service.py``) and the
connection-management/sync surfaces, plus the ``start_connect`` result
dataclass. Split out of ``service.py`` purely for module size — behavior,
identity, and callers are unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config.integrations_contracts import ERROR_PROPERTY_NOT_ACCESSIBLE


class IntegrationNotConfiguredError(RuntimeError):
    """Raised when the transport's OAuth client credentials are not env-set."""


class IntegrationStateError(ValueError):
    """Raised on an invalid, expired, replayed, or mis-bound OAuth state."""


class IntegrationExchangeError(RuntimeError):
    """Raised when the provider code exchange fails."""


class IntegrationConnectionNotFoundError(LookupError):
    """Raised when a connection is missing or not in the caller's workspace."""


class PropertyDiscoveryUnsupportedError(RuntimeError):
    """Raised when a provider exposes no property listing to discover."""


class PropertyNotAccessibleError(RuntimeError):
    """The grant is healthy but cannot read the connection's property.

    Carries an ``error_code`` so it classifies like a provider failure in the
    connection test, while staying a distinct outcome: enumerating an account
    successfully is not evidence that a particular property inside it is
    readable, and reporting the two the same way is how an inaccessible
    property passed a test.
    """

    error_code = ERROR_PROPERTY_NOT_ACCESSIBLE


@dataclass(frozen=True)
class IntegrationOAuthStart:
    authorize_url: str
    session_nonce: str
