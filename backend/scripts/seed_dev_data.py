"""Seed realistic development data for Searchify.

Creates, through the real ORM/domain layer (never raw SQL), a full demo
dataset covering every major surface of the app:

  - A demo user (login: demo@searchify.dev / DemoPass123!) with a personal
    workspace (auto-created via ``register_user``) plus a second workspace.
  - Two ``Project``s with normalized brand identity (Brand/BrandAlias/
    Competitor/OwnedDomain/UnintendedDomain), covering all three
    ``benchmark_mode`` values across the two projects.
  - A ``PromptSet`` per project with prompts covering every ``intent``
    (discovery/comparison/purchase/service/local) and every ``status``
    (active/proposed/archived).
  - BYOK ``ProviderConnection`` + ``ProviderRoute`` rows for all three
    approved engines (chatgpt/gemini/claude) using fake encrypted keys
    (invariant 6 - no real secrets required).
  - A fully completed ``Audit`` (with frozen snapshots, tasks, raw response
    artifacts, response analyses, brand/competitor mentions, citations, and
    a metric snapshot) produced by running the REAL planner
    (``create_audit``) + the REAL ``AuditWorker`` against a stubbed
    answer-engine adapter (no network calls) - mirrors
    ``tests/component/test_analysis_api.py::_run_completed_audit``.
  - A second, smaller audit on the second project so the dashboard/audit
    list has more than one entry.
  - A completed Site Health crawl (via the real ``SiteHealthWorker`` against
    a mocked HTTP transport) with pages ranging from rich/healthy to thin/
    unhealthy, producing page analyses, rule evaluations, issues, and a
    crawl-level snapshot.
  - Products + a competitor product for the Agentic Commerce surface.

Idempotent: re-running deletes any previously-seeded demo workspaces (by a
well-known name prefix) before recreating them, so it is safe to run
repeatedly against the same database.

Usage (from backend/):
    uv run python -m scripts.seed_dev_data
"""

from __future__ import annotations

import asyncio
import gzip
import logging
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.contracts import (
    AnswerEngineRequest,
    AnswerEngineResponse,
    CitationResult,
    SearchEventResult,
)
from app.core.config.audits import audit_settings
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
    TRANSPORT_ANTHROPIC,
    TRANSPORT_GOOGLE,
    TRANSPORT_OPENAI,
    default_model,
)
from app.core.config.site_health import CAPABILITY_STARTER
from app.core.database import SessionLocal
from app.core.security import encrypt_secret
from app.domain.audits.planner import create_audit
from app.domain.auth.service import EmailAlreadyRegisteredError, register_user
from app.domain.site_health.entitlements import set_entitlement
from app.domain.site_health.planner import create_crawl
from app.domain.site_health.selection import (
    BULK_SELECT_MODE_ALL,
    bulk_select_monitored_set,
)
from app.domain.workspaces.service import ensure_personal_workspace
from app.models.brand import (
    Brand,
    BrandAlias,
    Competitor,
    OwnedDomain,
    UnintendedDomain,
)
from app.models.product import CompetitorProduct, Product
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.provider import ProviderConnection, ProviderRoute
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.workers import audit_worker
from app.workers.audit_worker import AuditWorker
from app.workers.site_health_worker import SiteHealthWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_dev_data")

DEMO_EMAIL = "demo@searchify.dev"
DEMO_PASSWORD = "DemoPass123!"
DEMO_WORKSPACE_NAMES = ("Wanderlust Gear Co.", "Wanderlust Gear Co. - Agency")
_PUBLIC_IP = "93.184.216.34"


# ---------------------------------------------------------------------------
# Stub answer-engine adapter (no network calls) - mirrors
# tests/component/test_analysis_api.py::_StubAdapter but varies the answer
# per engine/prompt so different prompts get different mention/citation
# outcomes (some brand-mentioning, some not, some citing competitor only).
# ---------------------------------------------------------------------------
class _SeedStubAdapter:
    def __init__(
        self, *, logical_engine: str, transport_provider: str, **_: object
    ) -> None:
        self.logical_engine = logical_engine
        self.transport_provider = transport_provider

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        prompt = request.prompt
        # Deterministic variety: every 3rd prompt has no brand mention at all
        # (a real "lost" query), the rest mention the brand and cite it.
        bucket = abs(hash(prompt)) % 3
        if bucket == 0:
            answer = (
                f"For '{prompt}', popular options include TrailBlaze Packs and "
                "Summit Gear. Both offer solid warranties."
            )
            citations = (
                CitationResult(
                    ordinal=0,
                    url="https://trailblazepacks.com/",
                    title="TrailBlaze Packs",
                    domain="trailblazepacks.com",
                    start_index=0,
                    end_index=12,
                    cited_text="TrailBlaze Packs",
                ),
            )
        elif bucket == 1:
            answer = (
                f"When it comes to '{prompt}', Wanderlust Gear Co. is a strong "
                "choice thanks to its lifetime warranty, and TrailBlaze Packs is "
                "a solid alternative for budget shoppers."
            )
            citations = (
                CitationResult(
                    ordinal=0,
                    url="https://wanderlustgear.com/backpacks",
                    title="Wanderlust Gear - Backpacks",
                    domain="wanderlustgear.com",
                    start_index=0,
                    end_index=15,
                    cited_text="Wanderlust Gear",
                ),
                CitationResult(
                    ordinal=1,
                    url="https://trailblazepacks.com/",
                    title="TrailBlaze Packs",
                    domain="trailblazepacks.com",
                    start_index=0,
                    end_index=12,
                    cited_text="TrailBlaze Packs",
                ),
            )
        else:
            answer = (
                f"'{prompt}' - Wanderlust Gear Co. consistently ranks well in "
                "outdoor gear roundups for durability and customer service."
            )
            citations = (
                CitationResult(
                    ordinal=0,
                    url="https://wanderlustgear.com/reviews",
                    title="Wanderlust Gear Reviews",
                    domain="wanderlustgear.com",
                    start_index=0,
                    end_index=15,
                    cited_text="Wanderlust Gear",
                ),
            )
        return AnswerEngineResponse(
            logical_engine=self.logical_engine,
            transport_provider=self.transport_provider,
            transport_model=request.model,
            answer_text=answer,
            search_used=True,
            search_events=(SearchEventResult(sequence=0, query=prompt),),
            citations=citations,
            provider_metadata={"query_text_available": True},
            usage={"input_tokens": 12, "output_tokens": 48},
            latency_ms=850,
        )


def _build_seed_adapter(
    *, logical_engine: str, transport_provider: str, **kwargs: object
):
    return _SeedStubAdapter(
        logical_engine=logical_engine, transport_provider=transport_provider, **kwargs
    )


# ---------------------------------------------------------------------------
# Site Health mock HTTP transport (no network calls)
# ---------------------------------------------------------------------------
class _ByteStream(httpx.AsyncByteStream):
    def __init__(self, data: bytes) -> None:
        self._data = data

    async def __aiter__(self):
        yield self._data

    async def aclose(self) -> None:
        return None


class _FakeResolver:
    async def resolve(self, host: str, port: int) -> list[str]:
        return [_PUBLIC_IP]


def _rich_html(path: str, title: str, links: list[str]) -> bytes:
    words = " ".join(f"word{i}" for i in range(140))
    anchors = "".join(f'<a href="{link}">{link}</a>' for link in links)
    return (
        f"<html><head><title>{title}</title>"
        f'<meta name="description" content="A detailed page about {title}.">'
        f'<link rel="canonical" href="https://wanderlustgear.com{path}">'
        f'<meta property="og:title" content="{title}">'
        '<meta name="author" content="Wanderlust Editorial">'
        '<meta property="article:published_time" content="2026-06-01T00:00:00Z">'
        '<script type="application/ld+json">'
        '{"@type":"Organization","name":"Wanderlust Gear Co.",'
        '"url":"https://wanderlustgear.com","sameAs":["https://twitter.com/wanderlustgear"]}'
        "</script></head><body>"
        f"<h1>{title}</h1><p>{words}</p>"
        "<h2>What makes this reliable?</h2>"
        f"{anchors}"
        '<a href="https://external.org/review">external review</a>'
        "</body></html>"
    ).encode()


def _thin_html(title: str) -> bytes:
    return (
        f"<html><head><title>{title}</title></head><body><p>too short</p></body></html>"
    ).encode()


def _site_pages() -> dict[str, bytes | tuple[bytes, dict[str, str]]]:
    rich = _rich_html("/", "Wanderlust Gear Co. - Home", ["/backpacks", "/reviews"])
    backpacks = _rich_html("/backpacks", "Backpacks Catalog", ["/"])
    reviews = _rich_html("/reviews", "Customer Reviews", ["/"])
    thin = _thin_html("Contact")
    return {
        "/": (
            gzip.compress(rich),
            {
                "content-encoding": "gzip",
                "strict-transport-security": "max-age=63072000; includeSubDomains",
            },
        ),
        "/backpacks": backpacks,
        "/reviews": reviews,
        "/contact": thin,
    }


def _site_transport() -> httpx.MockTransport:
    pages = _site_pages()

    def handler(request: httpx.Request) -> httpx.Response:
        entry = pages.get(request.url.path)
        if entry is None:
            return httpx.Response(
                404,
                headers={"content-type": "text/html"},
                stream=_ByteStream(b"not found"),
            )
        if isinstance(entry, tuple):
            body, extra_headers = entry
            headers = {"content-type": "text/html", **extra_headers}
        else:
            body, headers = entry, {"content-type": "text/html"}
        return httpx.Response(200, headers=headers, stream=_ByteStream(body))

    return httpx.MockTransport(handler)


# ---------------------------------------------------------------------------
# Cleanup (idempotency)
# ---------------------------------------------------------------------------
async def _cleanup_previous_seed(session: AsyncSession) -> None:
    existing = (
        (
            await session.execute(
                select(Workspace).where(Workspace.name.in_(DEMO_WORKSPACE_NAMES))
            )
        )
        .scalars()
        .all()
    )
    for ws in existing:
        await session.delete(ws)
    if existing:
        await session.commit()
        logger.info("Removed %d previously-seeded demo workspace(s)", len(existing))

    existing_user = (
        await session.execute(select(User).where(User.email == DEMO_EMAIL))
    ).scalar_one_or_none()
    if existing_user is not None:
        await session.delete(existing_user)
        await session.commit()
        logger.info("Removed previously-seeded demo user")


# ---------------------------------------------------------------------------
# Main seed
# ---------------------------------------------------------------------------
async def seed() -> None:
    async with SessionLocal() as session:
        await _cleanup_previous_seed(session)

    # 1. Demo user + personal workspace (via the real auth service).
    async with SessionLocal() as session:
        try:
            user = await register_user(session, DEMO_EMAIL, DEMO_PASSWORD)
        except EmailAlreadyRegisteredError:
            user = (
                await session.execute(select(User).where(User.email == DEMO_EMAIL))
            ).scalar_one()
        # ensure_personal_workspace is idempotent; may already exist.
        personal_ws = await ensure_personal_workspace(session, user)
        if personal_ws is None:
            personal_ws = (
                (
                    await session.execute(
                        select(Workspace)
                        .join(
                            WorkspaceMember,
                            WorkspaceMember.workspace_id == Workspace.id,
                        )
                        .where(WorkspaceMember.user_id == user.id)
                    )
                )
                .scalars()
                .first()
            )
        # Rename the auto-created personal workspace to our demo name so
        # cleanup/re-run can find it, and add a second agency workspace.
        personal_ws.name = DEMO_WORKSPACE_NAMES[0]
        agency_ws = Workspace(name=DEMO_WORKSPACE_NAMES[1])
        session.add(agency_ws)
        await session.flush()
        session.add(
            WorkspaceMember(workspace_id=agency_ws.id, user_id=user.id, role="owner")
        )
        await session.commit()
        workspace_id = personal_ws.id
        agency_workspace_id = agency_ws.id
        logger.info(
            "Seeded user %s workspaces=%s/%s",
            user.email,
            workspace_id,
            agency_workspace_id,
        )

    # 2. Provider connections + routes (BYOK, fake keys) on the main workspace.
    async with SessionLocal() as session:
        engines_transports = [
            (ENGINE_CHATGPT, TRANSPORT_OPENAI),
            (ENGINE_CLAUDE, TRANSPORT_ANTHROPIC),
            (ENGINE_GEMINI, TRANSPORT_GOOGLE),
        ]
        for engine, transport in engines_transports:
            connection = ProviderConnection(
                workspace_id=workspace_id,
                label=f"{engine.capitalize()} (dev key)",
                transport_provider=transport,
                api_key_encrypted=encrypt_secret(f"dev-fake-key-for-{engine}"),
                active=True,
                last_test_status="success",
                last_tested_at=datetime.now(UTC),
            )
            session.add(connection)
            await session.flush()
            session.add(
                ProviderRoute(
                    workspace_id=workspace_id,
                    connection_id=connection.id,
                    logical_engine=engine,
                    transport_provider=transport,
                    transport_model=default_model(engine, transport),
                    is_default=True,
                )
            )
        await session.commit()
        logger.info("Seeded 3 provider connections + routes")

    # 3. Project #1: Wanderlust Gear Co. (controlled_localized benchmark mode).
    async with SessionLocal() as session:
        project = Project(
            workspace_id=workspace_id,
            name="Wanderlust Gear - US Backpacks",
            brand_name="Wanderlust Gear Co.",
            website_url="https://wanderlustgear.com",
            country_code="US",
            language_code="en-US",
            benchmark_mode="controlled_localized",
            default_repetitions=2,
        )
        session.add(project)
        await session.flush()

        brand = Brand(project_id=project.id, name="Wanderlust Gear Co.")
        session.add(brand)
        await session.flush()
        session.add(BrandAlias(brand_id=brand.id, alias="Wanderlust"))
        session.add(BrandAlias(brand_id=brand.id, alias="Wanderlust Gear"))

        trailblaze = Competitor(
            project_id=project.id,
            name="TrailBlaze Packs",
            aliases=["TrailBlaze"],
            domains=["trailblazepacks.com"],
        )
        session.add(trailblaze)
        session.add(
            Competitor(
                project_id=project.id,
                name="Summit Gear",
                aliases=["Summit"],
                domains=["summitgear.com"],
            )
        )
        await session.flush()
        session.add(OwnedDomain(project_id=project.id, domain="wanderlustgear.com"))
        session.add(
            UnintendedDomain(
                project_id=project.id, domain="wanderlustgear.blogspot.com"
            )
        )

        # Prompts covering every intent + every status.
        prompt_set = PromptSet(project_id=project.id, name="Core Discovery Set")
        session.add(prompt_set)
        await session.flush()

        prompt_specs = [
            (
                "best hiking backpack for a week-long trip",
                "discovery",
                "active",
                "manual",
            ),
            (
                "what is the most durable travel backpack under $200",
                "discovery",
                "active",
                "manual",
            ),
            (
                "Wanderlust Gear vs TrailBlaze Packs which is better",
                "comparison",
                "active",
                "manual",
            ),
            (
                "compare Summit Gear and Wanderlust Gear warranties",
                "comparison",
                "active",
                "imported",
            ),
            (
                "where can I buy a waterproof backpack online",
                "purchase",
                "active",
                "manual",
            ),
            (
                "best place to buy carry-on travel backpacks",
                "purchase",
                "active",
                "manual",
            ),
            ("does Wanderlust Gear offer free returns", "service", "active", "manual"),
            (
                "how do I file a warranty claim for a torn backpack",
                "service",
                "proposed",
                "generated",
            ),
            (
                "best outdoor gear shops near Denver Colorado",
                "local",
                "active",
                "manual",
            ),
            (
                "hiking backpack stores in Seattle Washington",
                "local",
                "proposed",
                "generated",
            ),
            (
                "old prompt about discontinued backpack line",
                "discovery",
                "archived",
                "manual",
            ),
        ]
        prompt_ids: list[uuid.UUID] = []
        for text, intent, status, origin in prompt_specs:
            prompt = Prompt(
                prompt_set_id=prompt_set.id,
                text=text,
                theme="backpacks",
                intent=intent,
                status=status,
                enabled=status != "archived",
                origin=origin,
            )
            session.add(prompt)
            await session.flush()
            prompt_ids.append(prompt.id)

        # Products (Agentic Commerce surface).
        session.add(
            Product(
                project_id=project.id,
                name="Summit 40L Trail Pack",
                sku="WGC-S40-BLK",
                url="https://wanderlustgear.com/backpacks/summit-40l",
                price=189.99,
                currency="USD",
            )
        )
        session.add(
            Product(
                project_id=project.id,
                name="Voyager 25L Carry-On Pack",
                sku="WGC-V25-GRY",
                url="https://wanderlustgear.com/backpacks/voyager-25l",
                price=129.99,
                currency="USD",
            )
        )
        session.add(
            CompetitorProduct(
                project_id=project.id,
                competitor_id=trailblaze.id,
                name="TrailBlaze Alpine 45",
                url="https://trailblazepacks.com/alpine-45",
                price=174.99,
                currency="USD",
            )
        )

        await session.commit()
        project_id = project.id
        active_prompt_ids = [
            pid
            for pid, (_t, _i, status, _o) in zip(prompt_ids, prompt_specs, strict=True)
            if status == "active"
        ]
        logger.info(
            "Seeded project %s with %d prompts (%d active)",
            project_id,
            len(prompt_ids),
            len(active_prompt_ids),
        )

    # 4. Project #2: a second, smaller project on the agency workspace
    #    (forced_grounded benchmark mode) to exercise multi-project / cross-
    #    workspace surfaces.
    async with SessionLocal() as session:
        project2 = Project(
            workspace_id=agency_workspace_id,
            name="CamperCo Awnings",
            brand_name="CamperCo",
            website_url="https://camperco.example.com",
            country_code="AU",
            language_code="en-AU",
            benchmark_mode="forced_grounded",
            default_repetitions=1,
        )
        session.add(project2)
        await session.flush()
        brand2 = Brand(project_id=project2.id, name="CamperCo")
        session.add(brand2)
        await session.flush()
        session.add(BrandAlias(brand_id=brand2.id, alias="Camper Co"))
        session.add(
            Competitor(
                project_id=project2.id,
                name="OutbackShade",
                aliases=[],
                domains=["outbackshade.example.com"],
            )
        )
        session.add(OwnedDomain(project_id=project2.id, domain="camperco.example.com"))
        await session.commit()
        project2_id = project2.id
        logger.info("Seeded project %s (agency workspace)", project2_id)

    async with SessionLocal() as session:
        prompt_set2 = PromptSet(project_id=project2_id, name="Awning Prompts")
        session.add(prompt_set2)
        await session.flush()
        for text, intent in [
            ("best RV awning for hot climates", "discovery"),
            ("CamperCo vs OutbackShade awnings", "comparison"),
            ("where to buy a retractable camper awning", "purchase"),
        ]:
            session.add(
                Prompt(
                    prompt_set_id=prompt_set2.id,
                    text=text,
                    theme="awnings",
                    intent=intent,
                    status="active",
                    enabled=True,
                    origin="manual",
                )
            )
        await session.commit()
        prompt_set2_id = prompt_set2.id

    # Provider connection for the agency workspace (gemini only - smaller audit).
    async with SessionLocal() as session:
        connection2 = ProviderConnection(
            workspace_id=agency_workspace_id,
            label="Gemini (dev key)",
            transport_provider=TRANSPORT_GOOGLE,
            api_key_encrypted=encrypt_secret("dev-fake-key-for-gemini-agency"),
            active=True,
        )
        session.add(connection2)
        await session.flush()
        session.add(
            ProviderRoute(
                workspace_id=agency_workspace_id,
                connection_id=connection2.id,
                logical_engine=ENGINE_GEMINI,
                transport_provider=TRANSPORT_GOOGLE,
                transport_model=default_model(ENGINE_GEMINI, TRANSPORT_GOOGLE),
                is_default=True,
            )
        )
        await session.commit()

    # 5. Run a REAL completed audit for project #1 across all 3 engines,
    #    using the stubbed adapter (no network calls) - patches build_adapter
    #    for the duration of this run only, then restores it.
    _original_build_adapter = audit_worker.build_adapter
    _original_min_interval = audit_settings.min_request_interval_seconds
    _original_heartbeat = audit_settings.heartbeat_interval_seconds
    audit_worker.build_adapter = _build_seed_adapter
    audit_settings.min_request_interval_seconds = 0.0
    audit_settings.heartbeat_interval_seconds = 3600.0
    try:
        async with SessionLocal() as session:
            audit1 = await create_audit(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                engines=[ENGINE_CHATGPT, ENGINE_CLAUDE, ENGINE_GEMINI],
                prompt_set_id=None,
                prompt_ids=active_prompt_ids,
                repetitions=2,
                random_seed="42",
            )
            audit1_id = audit1.id
        worker1 = AuditWorker(session_factory=SessionLocal, owner="seed-worker-1")
        await worker1.run_until_idle()
        logger.info("Completed audit %s for project %s", audit1_id, project_id)

        async with SessionLocal() as session:
            audit2 = await create_audit(
                session,
                workspace_id=agency_workspace_id,
                project_id=project2_id,
                engines=[ENGINE_GEMINI],
                prompt_set_id=prompt_set2_id,
                repetitions=1,
                random_seed="7",
            )
            audit2_id = audit2.id
        worker2 = AuditWorker(session_factory=SessionLocal, owner="seed-worker-2")
        await worker2.run_until_idle()
        logger.info("Completed audit %s for project %s", audit2_id, project2_id)
    finally:
        audit_worker.build_adapter = _original_build_adapter
        audit_settings.min_request_interval_seconds = _original_min_interval
        audit_settings.heartbeat_interval_seconds = _original_heartbeat

    # 6. Site Health: run the REAL crawl planner (`create_crawl`) + REAL
    #    SiteHealthWorker (with a mocked transport) to drain discovery, then
    #    select every discovered URL as "monitored" and recrawl so the
    #    Starter analyze tasks get seeded for them (mirrors the production
    #    "discover -> select monitored URLs -> recrawl analyzes" flow; a
    #    hand-built crawl/task never goes through that selection gate).
    async with SessionLocal() as session:
        await set_entitlement(session, workspace_id, CAPABILITY_STARTER)
        crawl1 = await create_crawl(
            session, workspace_id=workspace_id, project_id=project_id, random_seed="99"
        )
        crawl1_id = crawl1.id

    worker3 = SiteHealthWorker(
        session_factory=SessionLocal,
        owner="seed-site-worker",
        resolver=_FakeResolver(),
        transport=_site_transport(),
    )
    await worker3.run_until_idle()
    logger.info("Completed site health discovery crawl %s", crawl1_id)

    async with SessionLocal() as session:
        await bulk_select_monitored_set(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            crawl_id=crawl1_id,
            mode=BULK_SELECT_MODE_ALL,
            expected_selection_version=0,
        )
        await session.commit()

    # Recrawl: `create_crawl` re-seeds `analyze` tasks for every active
    # monitored URL (`seed_monitored_targets`), which is how Starter's
    # per-page analyses actually get produced.
    async with SessionLocal() as session:
        crawl2 = await create_crawl(
            session, workspace_id=workspace_id, project_id=project_id, random_seed="100"
        )
        crawl2_id = crawl2.id
    await worker3.run_until_idle()
    logger.info("Completed site health analysis crawl %s", crawl2_id)

    logger.info(
        "Seed complete. Demo login: %s / %s (workspace=%s, agency_workspace=%s)",
        DEMO_EMAIL,
        DEMO_PASSWORD,
        workspace_id,
        agency_workspace_id,
    )


if __name__ == "__main__":
    asyncio.run(seed())
