from app.core.config.audits import audit_execution_policy
from app.core.config.costs import ROUTE_CHATGPT, ROUTE_CLAUDE, ROUTE_GEMINI
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
    measurement_route,
    measurement_routes_for_engine,
)


def test_every_engine_has_one_retrieval_enabled_route() -> None:
    # Derived from the ROUTE_* identities, which test_grounded_cost_projection
    # pins to their exact literal models. One pin, asserted in one place: a
    # second literal copy here silently rots when the catalog moves.
    expected = {
        ENGINE_CHATGPT: (
            ROUTE_CHATGPT.transport_provider,
            ROUTE_CHATGPT.transport_model,
        ),
        ENGINE_CLAUDE: (
            ROUTE_CLAUDE.transport_provider,
            ROUTE_CLAUDE.transport_model,
        ),
        ENGINE_GEMINI: (
            ROUTE_GEMINI.transport_provider,
            ROUTE_GEMINI.transport_model,
        ),
    }
    for engine, identity in expected.items():
        routes = measurement_routes_for_engine(engine)
        assert len(routes) == 1
        route = measurement_route(engine)
        assert (route.transport_provider, route.transport_model) == identity
        assert route.retrieval_enabled is True


def test_audit_policy_is_citation_capable() -> None:
    policy = audit_execution_policy()
    assert policy.retrieval_enabled is True
    assert "citation" in policy.answer_instruction.casefold()
