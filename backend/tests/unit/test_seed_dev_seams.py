"""The answer-engine seam the development seeder monkeypatches.

It was broken and silently so: ``seed_dev_data`` patched
``app.workers.audit_worker.build_adapter``, an attribute that stopped existing
when the execution path moved to ``app.workers.audit.execution``; the
assignment created a new attribute nobody read, so seeded audits ran against
real providers with fake dev keys. These tests drive the real
``_build_adapter_or_fail`` and check WHICH factory it reached.
"""

from __future__ import annotations

import types

import pytest

from app.core.config.provider_catalog import CREDENTIAL_SOURCE_BYOK
from app.core.security import encrypt_secret
from app.workers.audit import execution as audit_execution
from scripts.seed_dev_runs import seeded_adapter
from scripts.seed_dev_support import (
    _build_seed_adapter,
    _SeedStubAdapter,
)


class _Executor(audit_execution.AuditExecutionMixin):
    """The mixin alone; only the happy path of the adapter build is driven."""


def _context() -> types.SimpleNamespace:
    """The fields ``_build_adapter_or_fail`` actually reads.

    Deliberately not the real ``ExecutionContext`` dataclass: this test is
    about which factory the method resolves, and a dozen unrelated required
    fields would make it fail for reasons that have nothing to do with that.
    """
    return types.SimpleNamespace(
        logical_engine="chatgpt",
        transport_provider="openai",
        credential_source=CREDENTIAL_SOURCE_BYOK,
        api_key_encrypted=encrypt_secret("dev-fake-key-for-chatgpt"),
        platform_credential_ref="",
        configuration={"country_code": "US"},
        base_url="",
    )


class TestAdapterFactorySeam:
    async def test_the_real_execution_path_reaches_the_seeded_factory(self) -> None:
        """Drive ``_build_adapter_or_fail`` itself, inside ``seeded_adapter``.

        This is the assertion the original bug would have failed: patching a
        module that no longer holds the name leaves the production factory in
        place, and the adapter that comes back is a real provider client.
        """
        with seeded_adapter():
            adapter = await _Executor()._build_adapter_or_fail(_context(), {})

        assert isinstance(adapter, _SeedStubAdapter)
        assert adapter.logical_engine == "chatgpt"
        assert adapter.transport_provider == "openai"

    async def test_outside_the_context_the_production_factory_is_used(self) -> None:
        """The stub must not leak past the ``with`` block."""
        adapter = await _Executor()._build_adapter_or_fail(_context(), {})

        assert not isinstance(adapter, _SeedStubAdapter)

    def test_seeded_adapter_installs_the_stub_and_restores_the_original(self) -> None:
        original = audit_execution.build_adapter

        with seeded_adapter():
            assert audit_execution.build_adapter is _build_seed_adapter

        assert audit_execution.build_adapter is original

    def test_seeded_adapter_restores_the_original_after_a_failure(self) -> None:
        original = audit_execution.build_adapter

        with pytest.raises(RuntimeError):
            with seeded_adapter():
                raise RuntimeError("seed stage blew up")

        assert audit_execution.build_adapter is original
