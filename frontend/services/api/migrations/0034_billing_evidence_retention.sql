-- Billing evidence keeps what each request and cost was (audit PR 12).
--
-- 1. An operator override's reason is grant evidence (BE-304, invariant 16).
--    Grants written before this column carry no reason: ''.

ALTER TABLE public.account_grants
    ADD COLUMN reason character varying(255) DEFAULT ''::character varying NOT NULL;

-- 2. Every catalog import request keeps its own idempotency key and result
--    (BE-305). A draft revision replaced by a later import still answers a
--    replay of the earlier one from here, never by rewriting the draft again.
--    Append-only: the application role inserts and reads.

CREATE TABLE public.billing_catalog_imports (
    id uuid NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    revision character varying(64) NOT NULL,
    payload_sha256 character varying(64) NOT NULL,
    actor_user_id uuid NOT NULL,
    reason character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT billing_catalog_imports_pkey PRIMARY KEY (id),
    CONSTRAINT uq_billing_catalog_imports_key UNIQUE (idempotency_key),
    CONSTRAINT billing_catalog_imports_revision_fkey FOREIGN KEY (revision)
        REFERENCES public.billing_catalog_revisions(revision) ON DELETE RESTRICT,
    CONSTRAINT billing_catalog_imports_actor_user_id_fkey FOREIGN KEY (actor_user_id)
        REFERENCES public.users(id) ON DELETE RESTRICT
);
CREATE INDEX ix_billing_catalog_imports_revision ON public.billing_catalog_imports
    USING btree (revision);
CREATE INDEX ix_billing_catalog_imports_actor_user_id ON public.billing_catalog_imports
    USING btree (actor_user_id);
REVOKE UPDATE, DELETE ON public.billing_catalog_imports FROM citeladder_app;

-- 3. Answer-engine internal costs survive project deletion with their exact
--    source IDs, like Agent model and platform call costs (DB-007). A cost row
--    stops referencing its audit, task and raw answer, which a project deletion
--    removes, keeps its workspace key, and carries the engine, provider and
--    model it was priced for, taken from its raw answer.

ALTER TABLE public.execution_cost_projections
    ADD COLUMN logical_engine character varying(32),
    ADD COLUMN transport_provider character varying(32),
    ADD COLUMN transport_model character varying(255);
UPDATE public.execution_cost_projections AS e
    SET logical_engine = r.logical_engine,
        transport_provider = r.transport_provider,
        transport_model = r.transport_model
    FROM public.raw_response_artifacts AS r WHERE r.id = e.raw_response_artifact_id;
ALTER TABLE public.execution_cost_projections
    ALTER COLUMN logical_engine SET NOT NULL,
    ALTER COLUMN transport_provider SET NOT NULL,
    ALTER COLUMN transport_model SET NOT NULL,
    DROP CONSTRAINT execution_cost_projections_workspace_id_audit_id_fkey,
    DROP CONSTRAINT execution_cost_projections_workspace_id_task_id_fkey,
    DROP CONSTRAINT execution_cost_projections_workspace_id_artifact_id_fkey,
    ADD CONSTRAINT execution_cost_projections_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX ix_execution_cost_projections_workspace_id ON public.execution_cost_projections
    USING btree (workspace_id);

-- The view reads the cost row alone, so a deleted project's answers still count.
CREATE OR REPLACE VIEW public.internal_costs AS
SELECT
    'platform_call'::character varying(24) AS source,
    c.id AS source_id,
    c.workspace_id,
    c.feature,
    c.provider,
    c.model,
    c.charge,
    c.cost_microusd,
    c.created_at AS occurred_at
FROM public.platform_calls AS c
UNION ALL
SELECT
    'agent_model_call'::character varying(24),
    a.id,
    a.workspace_id,
    'agent'::character varying(48),
    'model_gateway'::character varying(32),
    a.requested_model,
    (CASE WHEN a.funding_source = 'platform' THEN 'credits' ELSE 'not_charged' END)::character varying(16),
    a.cost_microusd,
    a.created_at
FROM public.agent_model_attempts AS a
UNION ALL
SELECT
    'answer_engine'::character varying(24),
    p.id,
    p.workspace_id,
    p.logical_engine,
    p.transport_provider,
    p.transport_model,
    'prompt_runs'::character varying(16),
    p.cost_microusd,
    p.created_at
FROM (
    SELECT DISTINCT ON (e.raw_response_artifact_id)
        e.id,
        e.workspace_id,
        e.logical_engine,
        e.transport_provider,
        e.transport_model,
        coalesce(e.provider_reported_cost_microusd, e.projected_total_cost_microusd) AS cost_microusd,
        e.created_at
    FROM public.execution_cost_projections AS e
    ORDER BY e.raw_response_artifact_id, e.created_at DESC, e.id DESC
) AS p;

-- 4. A subscription's evidence version is the Unix second the provider served
--    it (BE-004), which outgrows integer in January 2038.

ALTER TABLE public.billing_subscriptions
    ALTER COLUMN provider_state_version TYPE bigint;
