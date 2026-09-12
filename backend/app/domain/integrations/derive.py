"""Derivation: import artifact -> ``IntegrationMetricRow`` (I9, spec §4.5).

A pure PROJECTION invoked by the integrations worker after the raw import
lands — never a second provider fetch (invariant 7), and this module is the
single writer of ``IntegrationMetricRow`` (invariant 3).

- **Mapping resolution** — the run's FROZEN ``property_ref`` (captured at
  enqueue, never re-read from the mutable ``connection.account_ref``) is
  resolved through the ACTIVE ``IntegrationPropertyMapping`` to its
  ``project_id``; an unmapped property fails the run with
  ``unmapped_property`` and is NEVER guessed (spec §4 step 5). Resolving from
  the live connection instead would attribute rows fetched for property A to
  property B whenever the picker moved the connection mid-flight.
- **Transform** — every artifact payload row becomes one
  ``IntegrationMetricRow`` carrying the full provenance triple
  (invariant 4): ``source_artifact_id`` + ``INTEGRATION_IMPORTER_VERSION``
  (transform-code version) + the run's ``resync_seq`` (data-run revision).
  ``dimension_key`` packs ALL declared dimension values — date included,
  in template order — via the config-owned ``pack_dimension_key``
  (contract C1, invariant 2; analytics consumers peel the trailing date).
  The artifact row shape is the shared provider contract the clients
  normalize into (``{"rows": [{"keys": [...], "<metric>": ...}]}`` — GSC
  natively, GA4/Bing by client-side mapping, I11/I12); the metrics copied
  onto the row are exactly the dataset template's declared metric tokens
  (GSC clicks/impressions/ctr/position, GA4 sessions/engagedSessions/
  conversions, Bing clicks/impressions) — the mapping stays
  dataset-template-driven with no per-provider branches here.
- **Window projection** — a row whose parsed date falls OUTSIDE the
  run's ``[window_start, window_end]`` is dropped (I12): the Bing stats
  endpoints take no date-range parameters and return their full trailing
  window, so the window the run was enqueued for is enforced at
  projection time. GSC/GA4 honor the window server-side, so the filter
  is a no-op for them.
- **Idempotent** — rows insert via ``ON CONFLICT DO NOTHING`` on the
  identity tuple, so a retried derivation (resume-after-crash) is a dedup
  no-op, never an overwrite. A re-sync writes NEW rows at the higher
  ``resync_seq``; old revisions are retained.

``resync_seq`` is allocated per CONNECTION (``sync._next_resync_seq``), not
per window, so two runs whose windows overlap get comparable revisions on the
days they share and the later import wins. Readers resolve an identity by
taking its highest ``resync_seq`` and never sum across revisions.

A day the provider stops returning KEEPS its last observed value. Absence
from a later import is provider truncation, sampling, or a shortened
retention window — it is not a claim that the day had no traffic, and this
module will not manufacture one (invariant 4). Deleting or zeroing such a row
would turn a gap in observation into a measurement.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    INTEGRATION_IMPORTER_VERSION,
    MAPPING_STATUS_ACTIVE,
)
from app.core.config.integrations_datasets import (
    INTEGRATION_DATASET_TEMPLATES,
    IntegrationDatasetTemplate,
    pack_dimension_key,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_GA4,
    normalize_ga4_property_ref,
)
from app.models.integrations import (
    IntegrationConnection,
    IntegrationImportArtifact,
    IntegrationMetricRow,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)

# The date dimension literal every C1 template declares (trailing).
_DATE_DIMENSION = "date"
# GA4 ``runReport`` date values are compact ("20260720"); GSC dates are ISO.
_GA4_COMPACT_DATE_LEN = 8


class UnmappedPropertyError(RuntimeError):
    """The run's property has no ACTIVE mapping — fail, never guess."""


@dataclass(frozen=True)
class DerivedRun:
    """The outcome of deriving one run's artifacts."""

    project_id: uuid.UUID
    metric_row_count: int
    artifact_ids: tuple[uuid.UUID, ...]


async def resolve_active_mapping(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    provider: str,
    property_ref: str,
    for_update: bool = False,
) -> IntegrationPropertyMapping:
    """Resolve the ACTIVE mapping owning ``(workspace, provider, property)``.

    The partial unique index guarantees at most one ACTIVE owner, so this
    never picks between candidates; zero owners raises
    ``UnmappedPropertyError`` (the run fails, the property is never
    guessed). GA4 refs are normalized to the canonical bare-numeric form
    first — mappings are stored canonical (``create_mapping``) while a
    connection's ``account_ref`` may carry the provider's
    ``properties/`` resource-name spelling.

    ``for_update`` row-locks the owner. A derivation is a check-then-write
    against a row someone else can retire: unlocked, a disconnect committing
    between the check and the insert let the run write metric rows for a
    property the workspace had just given up.
    """
    if provider == INTEGRATION_PROVIDER_GA4:
        property_ref = normalize_ga4_property_ref(property_ref)
    statement = select(IntegrationPropertyMapping).where(
        IntegrationPropertyMapping.workspace_id == workspace_id,
        IntegrationPropertyMapping.provider == provider,
        IntegrationPropertyMapping.property_ref == property_ref,
        IntegrationPropertyMapping.status == MAPPING_STATUS_ACTIVE,
    )
    if for_update:
        statement = statement.with_for_update()
    result = await session.execute(statement)
    mapping = result.scalar_one_or_none()
    if mapping is None:
        raise UnmappedPropertyError(
            f"no active property mapping for {provider}:{property_ref!r}"
        )
    return mapping


def _parse_row_date(raw: str) -> date | None:
    """Parse one provider date-dimension value (ISO, or GA4 compact)."""
    text = raw.strip()
    try:
        return date.fromisoformat(text)
    except ValueError:
        pass
    if len(text) == _GA4_COMPACT_DATE_LEN and text.isdigit():
        try:
            return date(int(text[:4]), int(text[4:6]), int(text[6:]))
        except ValueError:
            return None
    return None


def _metric_row_values_for_payload(
    *,
    payload_row: Any,
    template: IntegrationDatasetTemplate,
    run: IntegrationSyncRun,
    mapping: IntegrationPropertyMapping,
    artifact: IntegrationImportArtifact,
    date_index: int,
) -> dict[str, Any] | None:
    """Project one provider row, dropping malformed or out-of-window data."""
    if not isinstance(payload_row, dict):
        return None
    keys = payload_row.get("keys")
    if not isinstance(keys, list) or len(keys) != len(template.dimensions):
        return None
    row_date = _parse_row_date(str(keys[date_index]))
    if row_date is None or not (run.window_start <= row_date <= run.window_end):
        return None
    metrics = {
        name: payload_row[name] for name in template.metrics if name in payload_row
    }
    return {
        "workspace_id": run.workspace_id,
        "project_id": mapping.project_id,
        "property_ref": mapping.property_ref,
        "provider": artifact.provider,
        "dataset": artifact.dataset,
        "date": row_date,
        # ALL declared dimension values, date included (C1).
        "dimension_key": pack_dimension_key([str(key) for key in keys]),
        "metrics": metrics,
        "source_artifact_id": artifact.id,
        "resync_seq": run.resync_seq,
        "importer_version": INTEGRATION_IMPORTER_VERSION,
    }


def build_metric_row_values(
    *,
    template: IntegrationDatasetTemplate,
    run: IntegrationSyncRun,
    mapping: IntegrationPropertyMapping,
    artifact: IntegrationImportArtifact,
) -> list[dict[str, Any]]:
    """Transform one artifact's payload rows into metric-row column values.

    Pure (no DB). A payload row whose ``keys`` do not match the template's
    declared dimension arity, whose date value is unparseable, or whose
    date falls outside the run's window (window projection — see the
    module docstring) is skipped — malformed or out-of-window provider
    data is dropped, never guessed.
    """
    payload = artifact.payload or {}
    payload_rows = payload.get("rows") or []
    date_index = template.dimensions.index(_DATE_DIMENSION)
    values: list[dict[str, Any]] = []
    for payload_row in payload_rows:
        row_values = _metric_row_values_for_payload(
            payload_row=payload_row,
            template=template,
            run=run,
            mapping=mapping,
            artifact=artifact,
            date_index=date_index,
        )
        if row_values is not None:
            values.append(row_values)
    return values


async def derive_run(
    session: AsyncSession,
    *,
    run: IntegrationSyncRun,
    connection: IntegrationConnection,
    artifacts: list[IntegrationImportArtifact],
) -> DerivedRun:
    """Derive one run's metric rows inside the caller's transaction.

    Resolves the run's FROZEN property to its active mapping (raising
    ``UnmappedPropertyError`` when the mapping has since been retired),
    transforms every artifact's rows, and inserts them conflict-safely on the
    identity tuple. The caller (the integrations worker) owns the transaction
    boundary + the run-row lock and performs the C5
    ``enqueue_post_sync_projections`` call as the final step.

    ``connection`` supplies only the provider. The property comes from the
    run: a re-selection during the fetch must fail this run, never silently
    re-attribute the rows it already fetched.
    """
    mapping = await resolve_active_mapping(
        session,
        workspace_id=run.workspace_id,
        provider=connection.provider,
        property_ref=run.property_ref,
        # Held for the rest of the caller's transaction, so a retirement
        # committing mid-derivation cannot slip past the check below and
        # leave rows attributed to a binding that no longer exists.
        for_update=True,
    )
    if mapping.id != run.mapping_id or mapping.project_id != run.project_id:
        # The property is still mapped, but to a different owner than the one
        # this run was enqueued for. Attributing the rows to the new owner
        # would be a guess about data fetched under the old binding.
        raise UnmappedPropertyError(
            f"run {run.id} targeted mapping {run.mapping_id}; "
            f"{run.property_ref!r} is now owned by {mapping.id}"
        )
    values: list[dict[str, Any]] = []
    for artifact in artifacts:
        template = INTEGRATION_DATASET_TEMPLATES.get(artifact.dataset)
        if template is None:
            # An unknown dataset id is skipped, never guessed (the config
            # templates are the only dataset vocabulary).
            continue
        values.extend(
            build_metric_row_values(
                template=template, run=run, mapping=mapping, artifact=artifact
            )
        )
    if values:
        await session.execute(
            pg_insert(IntegrationMetricRow)
            .values(values)
            .on_conflict_do_nothing(
                index_elements=[
                    "project_id",
                    "property_ref",
                    "provider",
                    "dataset",
                    "date",
                    "dimension_key",
                    "resync_seq",
                ]
            )
        )
    return DerivedRun(
        project_id=mapping.project_id,
        metric_row_count=len(values),
        artifact_ids=tuple(artifact.id for artifact in artifacts),
    )
