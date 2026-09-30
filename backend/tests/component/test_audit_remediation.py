"""PostgreSQL acceptance history and acquisition controls."""

import uuid

import pytest
from sqlalchemy.exc import OperationalError

from app.connectors.web_evidence.contracts import FetchError
from app.domain.site_health.acquisition_controls import authorize_acquisition
from app.models.project import Project
from app.models.user import User
from app.models.web_acquisition_control import WebAcquisitionControl
from app.models.workspace import Workspace, WorkspaceMember


async def _account(session):
    user = User(email=f"{uuid.uuid4()}@example.test", hashed_password="test")
    spaces = [Workspace(name=name) for name in ("Selected", "Unselected")]
    session.add_all([user, *spaces])
    await session.flush()
    for space in spaces:
        session.add_all(
            [
                WorkspaceMember(workspace_id=space.id, user_id=user.id),
                Project(
                    workspace_id=space.id,
                    name=space.name,
                    brand_name=space.name,
                    website_url="https://example.test",
                ),
            ]
        )
    await session.commit()
    return user, spaces


@pytest.mark.asyncio
async def test_suppression_is_live_matches_subdomains_and_global_stop(
    db_session, session_factory
):
    user, _spaces = await _account(db_session)
    await authorize_acquisition(
        "https://shop.example.test/page", session_factory=session_factory
    )
    rule = WebAcquisitionControl(
        domain="example.test",
        blocked=True,
        actor_id=user.id,
        reason="Verified crawler complaint",
    )
    db_session.add(rule)
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://shop.example.test/page", session_factory=session_factory
        )
    await authorize_acquisition(
        "https://notexample.test/", session_factory=session_factory
    )
    # A bare-TLD row is inert; only "*" stops every host.
    db_session.add(
        WebAcquisitionControl(
            domain="test", blocked=True, actor_id=user.id, reason="Stray TLD row"
        )
    )
    await db_session.commit()
    await authorize_acquisition(
        "https://unrelated.test/", session_factory=session_factory
    )
    db_session.add(
        WebAcquisitionControl(
            domain="xn--bcher-kva.test",
            blocked=True,
            actor_id=user.id,
            reason="Verified international domain complaint",
        )
    )
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://shop.bücher.test/page", session_factory=session_factory
        )
    rule.blocked = False
    await db_session.commit()
    await authorize_acquisition(
        "https://shop.example.test/page", session_factory=session_factory
    )
    db_session.add(
        WebAcquisitionControl(
            domain="*", blocked=True, actor_id=user.id, reason="Incident stop"
        )
    )
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://another.test/", session_factory=session_factory
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url", ["https://[unclosed/page", f"https://{'a' * 70}.example.test/"]
)
async def test_unparseable_hop_fails_closed_as_acquisition_unavailable(
    url, session_factory
):
    # A malformed redirect Location must be refused, never crash the caller.
    with pytest.raises(FetchError) as exc:
        await authorize_acquisition(url, session_factory=session_factory)
    assert exc.value.error_code == "acquisition_unavailable"
    assert isinstance(exc.value.__cause__, ValueError)


@pytest.mark.asyncio
async def test_policy_store_outage_fails_closed_as_typed_fetch_error():
    def unavailable_store():
        raise OperationalError("SELECT 1", {}, OSError("connection refused"))

    with pytest.raises(FetchError) as exc:
        await authorize_acquisition(
            "https://example.test/", session_factory=unavailable_store
        )
    assert exc.value.error_code == "acquisition_unavailable"
