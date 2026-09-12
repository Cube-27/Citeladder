"""Static guards for CiteLadder's pre-launch, single-revision baseline."""

from __future__ import annotations

import ast
from pathlib import Path

_MISSING = object()

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_VERSIONS_DIR = _BACKEND_ROOT.parent / "migrations" / "versions"
_BASELINE = _VERSIONS_DIR / "0001_initial.py"


def _created_tables(source: str) -> set[str]:
    tree = ast.parse(source)
    tables: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "create_table"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
        ):
            continue
        tables.add(node.args[0].value)
    return tables


def _created_table_columns(source: str) -> dict[str, set[str]]:
    tree = ast.parse(source)
    tables: dict[str, set[str]] = {}
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "create_table"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
        ):
            continue
        columns = {
            argument.args[0].value
            for argument in node.args[1:]
            if isinstance(argument, ast.Call)
            and isinstance(argument.func, ast.Attribute)
            and argument.func.attr == "Column"
            and argument.args
            and isinstance(argument.args[0], ast.Constant)
            and isinstance(argument.args[0].value, str)
        }
        tables[node.args[0].value] = columns
    return tables


def _module_constant(source: str, name: str) -> object:
    """Return a top-level ``name = <literal>`` value, or ``_MISSING``."""
    for node in ast.parse(source).body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == name:
                if isinstance(node.value, ast.Constant):
                    return node.value.value
    return _MISSING


def _imported_modules(source: str) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def _all_columns(source: str) -> set[str]:
    return {
        column
        for columns in _created_table_columns(source).values()
        for column in columns
    }


def test_0001_initial_is_the_only_migration_revision() -> None:
    revisions = sorted(_VERSIONS_DIR.glob("*.py"))

    assert revisions == [_BASELINE]
    source = _BASELINE.read_text(encoding="utf-8")
    assert _module_constant(source, "revision") == "0001_initial"
    assert _module_constant(source, "down_revision") is None
    tables = _created_tables(source)
    assert {
        # The generic Performance dimension rows behind the six GSC tables.
        "performance_dimension_stats",
        "mcp_oauth_clients",
        "mcp_authorization_requests",
        "mcp_authorization_codes",
        "mcp_oauth_grants",
        # Third-party sign-in identities; ``users.hashed_password`` is
        # nullable for the accounts it creates.
        "user_identities",
    } <= tables
    assert "site_crawl_phase_runs" not in tables
    assert "industry_pack_id" not in _all_columns(source)
    # A migration that imports the models couples the schema history to the
    # current model definitions, so the baseline declares its own columns.
    assert not any(
        module == "app.models" or module.startswith("app.models.")
        for module in _imported_modules(source)
    )


def test_baseline_contains_site_health_guidance_and_commerce_schema() -> None:
    source = _BASELINE.read_text(encoding="utf-8")
    tables = _created_tables(source)

    assert "opportunity_guidance" in tables
    assert (
        not {
            "commerce_discovery_runs",
            "commerce_discovery_tasks",
            "commerce_discovery_artifacts",
            "commerce_discovery_candidates",
            "commerce_candidate_reviews",
        }
        & tables
    )

    assert {
        "workspace_site_health_runtime",
        "site_health_profiles",
        "site_crawls",
        "site_discovery_frontier",
        "site_urls",
        "site_url_observations",
        "monitored_site_urls",
        "site_crawl_tasks",
        "site_fetch_attempts",
        "site_fetch_artifacts",
        "site_page_analyses",
        "site_rule_evaluations",
        "site_issues",
        "site_health_snapshots",
        "site_page_link_metrics",
        "site_observed_architectures",
        "site_crawl_events",
    } <= tables

    assert {
        "acquisition_transport",
        "acquisition_rung",
        "acquisition_trigger",
        "impersonation_profile",
        "acquisition_options",
        "acquisition_policy_version",
        "source_artifact_id",
        "source_architecture_id",
    } <= _all_columns(source)
    assert "scope" in _created_table_columns(source)["site_rule_evaluations"]
