"""The surface model: a measured surface that is observed, not asked.

These tests pin the three things that make a fourth surface safe to add
before its execution path exists: LLM request policy is null rather than
defaulted, the engine is READABLE but not SELECTABLE, and the credential
shape a transport authenticates with is enforced at the edge.
"""

from __future__ import annotations

import pytest

from app.core.config.dataforseo import (
    DataForSeoCredentialError,
    pack_credential,
    unpack_credential,
)
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_GOOGLE_AI_OVERVIEW,
    LOGICAL_ENGINES,
    SELECTABLE_ENGINES,
    SURFACE_KIND_LLM,
    SURFACE_KIND_SEARCH_AI,
    TRANSPORT_DATAFORSEO,
    MeasurementRoute,
    SearchContext,
    is_reasoning_pinned_off,
    is_route_approved,
    is_search_surface,
    is_selectable_engine,
    llm_reasoning_effort,
    llm_route,
    measurement_route,
    route_capacity_policy,
    route_policy,
    search_context,
)
from app.domain.providers.schemas import ProviderConnectionCreate


class TestSurfaceModel:
    def test_the_search_surface_publishes_no_llm_request_policy(self) -> None:
        route = measurement_route(ENGINE_GOOGLE_AI_OVERVIEW)
        assert route.surface_kind == SURFACE_KIND_SEARCH_AI
        assert route.retrieval_enabled is None
        assert route.reasoning_effort is None
        assert route.reasoning_pinnable is None

    def test_reading_an_llm_knob_off_a_search_surface_raises(self) -> None:
        # A None flowing onward as a default is the failure this prevents:
        # it would silently become "retrieval off" on a surface that has no
        # such concept.
        with pytest.raises(ValueError, match="search_ai surface"):
            llm_route(ENGINE_GOOGLE_AI_OVERVIEW)
        with pytest.raises(ValueError, match="search_ai surface"):
            llm_reasoning_effort(ENGINE_GOOGLE_AI_OVERVIEW)

    def test_an_llm_route_still_answers_the_llm_accessors(self) -> None:
        assert llm_route(ENGINE_CHATGPT).surface_kind == SURFACE_KIND_LLM
        assert llm_reasoning_effort(ENGINE_CHATGPT) == "off"
        assert is_reasoning_pinned_off(ENGINE_CHATGPT) is True

    def test_a_search_surface_is_not_reasoning_pinned_off(self) -> None:
        # False, not an error: the caller is asking whether to SEND a pin,
        # and for an observed surface the answer is simply no.
        assert is_reasoning_pinned_off(ENGINE_GOOGLE_AI_OVERVIEW) is False

    def test_the_search_surface_carries_a_frozen_search_context(self) -> None:
        context = search_context(ENGINE_GOOGLE_AI_OVERVIEW)
        assert context.location_code > 0
        assert context.language_code
        assert context.device

    def test_asking_an_llm_route_for_a_search_context_raises(self) -> None:
        with pytest.raises(ValueError, match="not a search surface"):
            search_context(ENGINE_CHATGPT)

    def test_is_search_surface_separates_the_two_kinds(self) -> None:
        assert is_search_surface(ENGINE_GOOGLE_AI_OVERVIEW) is True
        assert is_search_surface(ENGINE_CHATGPT) is False
        assert is_search_surface("nonexistent") is False

    def test_every_approved_route_declares_both_policies(self) -> None:
        for engine in LOGICAL_ENGINES:
            route = measurement_route(engine)
            assert route_policy(engine).surface_kind == route.surface_kind
            assert route_capacity_policy(engine, route.transport_provider) is not None

    def test_the_search_surface_route_is_approved(self) -> None:
        assert is_route_approved(ENGINE_GOOGLE_AI_OVERVIEW, TRANSPORT_DATAFORSEO)
        assert not is_route_approved(ENGINE_CHATGPT, TRANSPORT_DATAFORSEO)


class TestRouteConstruction:
    """A route cannot be built in a shape that means two things at once."""

    def test_a_search_route_may_not_pin_llm_fields(self) -> None:
        with pytest.raises(ValueError, match="must leave LLM fields null"):
            MeasurementRoute(
                logical_engine="x",
                transport_provider="y",
                transport_model="z",
                retrieval_enabled=True,
                reasoning_effort=None,
                reasoning_pinnable=None,
                representative_status="verified",
                surface_kind=SURFACE_KIND_SEARCH_AI,
                search_context=SearchContext(
                    location_code=1, language_code="en", device="desktop"
                ),
            )

    def test_a_search_route_needs_a_search_context(self) -> None:
        with pytest.raises(ValueError, match="needs a search context"):
            MeasurementRoute(
                logical_engine="x",
                transport_provider="y",
                transport_model="z",
                retrieval_enabled=None,
                reasoning_effort=None,
                reasoning_pinnable=None,
                representative_status="verified",
                surface_kind=SURFACE_KIND_SEARCH_AI,
            )

    def test_an_llm_route_must_pin_every_llm_field(self) -> None:
        with pytest.raises(ValueError, match="must pin every LLM field"):
            MeasurementRoute(
                logical_engine="x",
                transport_provider="y",
                transport_model="z",
                retrieval_enabled=None,
                reasoning_effort="off",
                reasoning_pinnable=True,
                representative_status="verified",
            )

    def test_an_llm_route_carries_no_search_context(self) -> None:
        with pytest.raises(ValueError, match="carries no search context"):
            MeasurementRoute(
                logical_engine="x",
                transport_provider="y",
                transport_model="z",
                retrieval_enabled=True,
                reasoning_effort="off",
                reasoning_pinnable=True,
                representative_status="verified",
                search_context=SearchContext(
                    location_code=1, language_code="en", device="desktop"
                ),
            )


class TestSelectability:
    """Readable and runnable are separate questions with one switch.

    The surface was a member of the read vocabulary for three slices before it
    became requestable. These tests now pin the ACTIVATED state; the gate
    itself is what kept a half-wired engine off the run form while it was
    being built.
    """

    def test_the_surface_is_both_known_and_selectable(self) -> None:
        assert ENGINE_GOOGLE_AI_OVERVIEW in LOGICAL_ENGINES
        assert ENGINE_GOOGLE_AI_OVERVIEW in SELECTABLE_ENGINES
        assert is_selectable_engine(ENGINE_GOOGLE_AI_OVERVIEW) is True

    def test_the_shipped_engines_stay_selectable(self) -> None:
        for engine in ("chatgpt", "claude", "gemini"):
            assert is_selectable_engine(engine) is True

    def test_selectable_engines_are_a_subset_of_known_engines(self) -> None:
        # The gate can only ever narrow. An engine nothing can analyse must
        # never become requestable by flipping one flag.
        assert set(SELECTABLE_ENGINES) <= set(LOGICAL_ENGINES)

    def test_selectability_is_derived_from_the_public_catalog(self) -> None:
        """One switch, not a second list to keep in step."""
        from app.core.config.provider_catalog import PUBLIC_PROVIDER_CATALOG

        shipped = {
            entry.key for entry in PUBLIC_PROVIDER_CATALOG if entry.adapter_shipped
        }
        assert set(SELECTABLE_ENGINES) == shipped & set(LOGICAL_ENGINES)

    def test_a_display_only_provider_is_never_selectable(self) -> None:
        for key in ("grok", "perplexity", "copilot"):
            assert is_selectable_engine(key) is False


class TestCredentialShape:
    """One stored secret, two auth shapes, neither leaking into the other."""

    def test_a_pair_round_trips_through_the_stored_shape(self) -> None:
        packed = pack_credential(login="user@example.com", password="s3cret")
        credential = unpack_credential(packed)
        assert credential.login == "user@example.com"
        assert credential.password == "s3cret"
        assert credential.basic_auth() == ("user@example.com", "s3cret")

    @pytest.mark.parametrize(
        "login,password",
        [("", "pw"), ("user", ""), ("   ", "pw")],
    )
    def test_half_a_credential_is_refused_at_pack_time(
        self, login: str, password: str
    ) -> None:
        # Failing when the connection is SAVED beats failing on its first
        # paid task with an opaque authentication error.
        with pytest.raises(DataForSeoCredentialError):
            pack_credential(login=login, password=password)

    @pytest.mark.parametrize(
        "secret",
        ["not json", "[]", '{"login": "u"}', '{"login": "u", "password": 1}', "{}"],
    )
    def test_an_unreadable_stored_secret_raises_without_echoing_it(
        self, secret: str
    ) -> None:
        with pytest.raises(DataForSeoCredentialError) as excinfo:
            unpack_credential(secret)
        assert secret not in str(excinfo.value)

    def test_the_search_transport_accepts_a_pair(self) -> None:
        payload = ProviderConnectionCreate(
            transport_provider=TRANSPORT_DATAFORSEO,
            api_login="user@example.com",
            api_password="s3cret",
        )
        assert unpack_credential(payload.secret_material()).login == "user@example.com"

    def test_the_search_transport_refuses_a_bearer_key(self) -> None:
        with pytest.raises(ValueError, match="not a single key"):
            ProviderConnectionCreate(
                transport_provider=TRANSPORT_DATAFORSEO, api_key="sk-live"
            )

    def test_the_search_transport_refuses_half_a_pair(self) -> None:
        with pytest.raises(ValueError, match="login and an API password"):
            ProviderConnectionCreate(
                transport_provider=TRANSPORT_DATAFORSEO, api_login="user"
            )

    def test_a_bearer_transport_refuses_a_pair(self) -> None:
        with pytest.raises(ValueError, match="not a login and password"):
            ProviderConnectionCreate(
                transport_provider="openai", api_login="user", api_password="pw"
            )

    def test_a_bearer_transport_still_requires_its_key(self) -> None:
        with pytest.raises(ValueError, match="api_key is required"):
            ProviderConnectionCreate(transport_provider="openai")

    def test_a_bearer_credential_is_stored_verbatim(self) -> None:
        payload = ProviderConnectionCreate(
            transport_provider="openai", api_key="  sk-live  "
        )
        assert payload.secret_material() == "sk-live"


class TestSearchContextAdmission:
    """A run may not select a surface it has no vantage point for.

    Tested directly rather than through `create_audit`, because the
    selectability gate fires first and would mask this one until activation.
    """

    def _project(self, **overrides: object):
        from app.models.project import Project

        values = {
            "name": "P",
            "brand_name": "B",
            "serp_location_code": 2036,
            "serp_language_code": "en",
            "serp_device": "desktop",
        }
        values.update(overrides)
        return Project(**values)

    def test_a_configured_project_passes(self) -> None:
        from app.domain.audits.creation import _require_search_context

        _require_search_context(
            project=self._project(), engines=[ENGINE_GOOGLE_AI_OVERVIEW]
        )

    def test_a_missing_location_is_rejected_by_name(self) -> None:
        from app.domain.audits.creation import _require_search_context
        from app.domain.audits.errors import AuditValidationError

        with pytest.raises(AuditValidationError, match="search location"):
            _require_search_context(
                project=self._project(serp_location_code=0),
                engines=[ENGINE_GOOGLE_AI_OVERVIEW],
            )

    def test_an_unsupported_location_is_rejected_rather_than_defaulted(self) -> None:
        # Silently measuring somewhere else would be a wrong measurement
        # presented as a right one.
        from app.domain.audits.creation import _require_search_context
        from app.domain.audits.errors import AuditValidationError

        with pytest.raises(AuditValidationError, match="not one this deployment"):
            _require_search_context(
                project=self._project(serp_location_code=999999),
                engines=[ENGINE_GOOGLE_AI_OVERVIEW],
            )

    def test_an_llm_only_run_never_consults_the_search_context(self) -> None:
        from app.domain.audits.creation import _require_search_context

        _require_search_context(
            project=self._project(serp_location_code=0),
            engines=[ENGINE_CHATGPT, "claude", "gemini"],
        )


class TestRotationShape:
    """A rotation in the wrong shape is refused, never silently dropped."""

    def _connection(self, transport: str):
        from app.models.provider import ProviderConnection

        return ProviderConnection(transport_provider=transport, api_key_encrypted="x")

    def _update(self, **values: object):
        from app.domain.providers.schemas import ProviderConnectionUpdate

        return ProviderConnectionUpdate(**values)

    def test_omitting_credentials_leaves_the_stored_secret_alone(self) -> None:
        from app.domain.providers.connection_updates import rotated_secret

        assert rotated_secret(self._connection("openai"), self._update()) is None
        assert (
            rotated_secret(self._connection(TRANSPORT_DATAFORSEO), self._update())
            is None
        )

    def test_a_complete_pair_rotates_the_search_credential(self) -> None:
        from app.domain.providers.connection_updates import rotated_secret

        secret = rotated_secret(
            self._connection(TRANSPORT_DATAFORSEO),
            self._update(api_login="u@x.com", api_password="pw"),
        )
        assert secret is not None
        assert unpack_credential(secret).login == "u@x.com"

    def test_half_a_pair_is_refused_by_the_schema(self) -> None:
        # Rotating one half against a remembered other half would leave the
        # stored credential in a state nobody entered.
        with pytest.raises(ValueError, match="both halves"):
            self._update(api_login="u@x.com")

    def test_a_key_and_a_pair_together_are_refused_by_the_schema(self) -> None:
        with pytest.raises(ValueError, match="not both"):
            self._update(api_key="sk-x", api_login="u", api_password="p")

    def test_a_bearer_key_sent_to_a_search_connection_is_refused_by_name(
        self,
    ) -> None:
        # Silently ignoring it would report a rotation that never happened.
        from app.domain.providers.connection_updates import (
            CredentialShapeError,
            rotated_secret,
        )

        with pytest.raises(CredentialShapeError, match="not a single key"):
            rotated_secret(
                self._connection(TRANSPORT_DATAFORSEO), self._update(api_key="sk-x")
            )

    def test_a_pair_sent_to_a_bearer_connection_is_refused_by_name(self) -> None:
        from app.domain.providers.connection_updates import (
            CredentialShapeError,
            rotated_secret,
        )

        with pytest.raises(CredentialShapeError, match="not a login and password"):
            rotated_secret(
                self._connection("openai"),
                self._update(api_login="u@x.com", api_password="pw"),
            )


class TestFundedModeExcludesTheSearchSurface:
    def test_a_funded_run_cannot_select_the_byok_only_surface(self) -> None:
        """Rejected where the error can still name the cause.

        Funded routing binds a platform connection at per-task credential
        resolution, and no platform DataForSEO account is provisioned. Letting
        it through would admit a run that then failed every task on an opaque
        `execution_credentials_unavailable`.
        """
        from app.domain.audits.errors import AuditValidationError
        from app.domain.audits.resolution import _resolve_funded_routes

        with pytest.raises(AuditValidationError, match="your own DataForSEO"):
            _resolve_funded_routes([ENGINE_GOOGLE_AI_OVERVIEW])

    def test_funded_routing_still_works_for_the_llm_engines(self) -> None:
        from app.domain.audits.resolution import _resolve_funded_routes

        resolved = _resolve_funded_routes([ENGINE_CHATGPT])
        assert resolved[ENGINE_CHATGPT].transport_provider == "openai"
