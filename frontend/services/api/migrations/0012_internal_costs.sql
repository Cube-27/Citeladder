-- One internal-cost view (architecture untangle K1). Forward-only and safe on
-- existing rows.
--
-- Each Agent model call records its internal cost in micro-USD at settlement,
-- in the same transaction as its debit. Existing rows keep NULL (unknown),
-- distinct from a zero cost.
ALTER TABLE public.agent_model_attempts
    ADD COLUMN cost_microusd bigint;
ALTER TABLE public.agent_model_attempts
    ADD CONSTRAINT ck_agent_model_attempt_cost CHECK (cost_microusd IS NULL OR cost_microusd >= 0);

-- Every provider cost the platform bears, one row per call, whoever pays for
-- it: platform calls (gateway, JEV, Tavily, Keenable, DataForSEO), Agent model
-- calls and answer-engine executions. A NULL cost is unknown, never zero.
-- `charge` is how the call is funded: AI credits (`credits`), included in a
-- prompt run (`included`, `prompt_runs`), or not charged (`not_charged`).
-- An answer engine execution shows its latest projection.
CREATE VIEW public.internal_costs AS
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
    au.workspace_id,
    p.logical_engine,
    p.transport_provider,
    p.transport_model,
    'prompt_runs'::character varying(16),
    p.cost_microusd,
    p.created_at
FROM (
    SELECT DISTINCT ON (e.raw_response_artifact_id)
        e.id,
        e.audit_id,
        r.logical_engine,
        r.transport_provider,
        r.transport_model,
        coalesce(e.provider_reported_cost_microusd, e.projected_total_cost_microusd) AS cost_microusd,
        e.created_at
    FROM public.execution_cost_projections AS e
    JOIN public.raw_response_artifacts AS r ON r.id = e.raw_response_artifact_id
    ORDER BY e.raw_response_artifact_id, e.created_at DESC, e.id DESC
) AS p
JOIN public.audits AS au ON au.id = p.audit_id;

-- The platform-wide daily spend read sums the day's uncharged calls.
CREATE INDEX ix_platform_calls_uncharged_created ON public.platform_calls
    USING btree (created_at) INCLUDE (cost_microusd)
    WHERE ((charge)::text <> 'credits'::text);
