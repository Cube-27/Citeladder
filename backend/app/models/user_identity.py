# Third-party sign-in identity persistence model (UUID PK).
#
# One row links a CiteLadder ``User`` to the account it signs in with at an
# external identity provider. Identity only — this table never scopes product
# data (invariant 5: access is granted through ``WorkspaceMember``).
#
# A separate table rather than columns on ``users`` because the provider
# catalog already spans google / github / apple
# (``app.core.config.oauth.OAUTH_PROVIDERS``) and one account may eventually
# carry several.
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserIdentity(Base):
    """One (provider, subject) sign-in identity bound to a local account.

    ``subject`` is the provider's own immutable account id (Google's ``sub``),
    never the email: an address can be reassigned inside a Workspace domain,
    the subject cannot. ``email`` is retained for display and for the
    ``login_hint`` that makes a later integration connect skip the account
    chooser; it is refreshed on each sign-in and is not an identity key.
    """

    __tablename__ = "user_identities"
    __table_args__ = (
        # The provider's account maps to exactly one local account.
        UniqueConstraint(
            "provider", "subject", name="uq_user_identities_provider_subject"
        ),
        # ...and one local account links at most one account per provider.
        UniqueConstraint(
            "user_id", "provider", name="uq_user_identities_user_provider"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255))
    # The provider's own verification claim at link time. Linking to an
    # existing local account is only ever done on a verified address.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
