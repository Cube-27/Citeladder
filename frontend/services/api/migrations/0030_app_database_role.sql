-- The least-privilege application role (OPS-003, DB-002). The schema owner,
-- which applies these migrations, keeps every privilege; the API, runner and
-- operator jobs connect as citeladder_app, which reads and writes rows only.
-- The migrate CLI sets the role's login password after this file applies.
--
-- A role belongs to the whole PostgreSQL server, so another database on the
-- same server may already have created it.
DO $$
BEGIN
    CREATE ROLE citeladder_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citeladder_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO citeladder_app;

-- Tables and sequences that later migrations create (as this same owner) get
-- the same row access. A later append-only table revokes UPDATE and DELETE in
-- its own migration (invariant 17).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO citeladder_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO citeladder_app;

-- The migration ledger belongs to the migrate job alone.
REVOKE ALL ON public.schema_migrations FROM citeladder_app;

-- Evidence, attempts and observations are written once (invariant 4); grants,
-- revocations, ledger entries and payment receipts are immutable billing
-- evidence (invariant 16). Foreign-key cascades still remove them with their
-- workspace, because PostgreSQL runs referential actions as the table owner.
REVOKE UPDATE, DELETE ON
    public.grant_revocations,
    public.provider_attempts,
    public.agent_tool_attempts,
    public.search_intelligence_dispatch_attempts,
    public.commerce_competitor_attempts,
    public.site_fetch_attempts,
    public.site_fetch_artifacts,
    public.integration_import_artifacts,
    public.page_snapshots,
    public.robots_snapshots,
    public.source_page_snapshots,
    public.brand_research_snapshots,
    public.aio_observations,
    public.answer_ad_observations,
    public.commerce_product_observations,
    public.commerce_recommendation_observations,
    public.site_change_observations
FROM citeladder_app;

-- Billing serializes on row locks over these append-only tables (SELECT ... FOR
-- UPDATE), and PostgreSQL grants a row lock only with UPDATE privilege. So the
-- role keeps that privilege here, loses DELETE, and a statement trigger refuses
-- every UPDATE it issues with the same permission error a revoked grant raises.
REVOKE DELETE ON
    public.account_grants,
    public.consumable_ledger,
    public.billing_payments,
    public.raw_response_artifacts
FROM citeladder_app;

CREATE FUNCTION public.refuse_app_role_update() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF current_user = 'citeladder_app' THEN
        RAISE EXCEPTION 'permission denied for table %', TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege',
                  HINT = 'Append-only rows are never rewritten; row locks remain available.';
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER append_only_app_update BEFORE UPDATE ON public.account_grants
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_app_role_update();
CREATE TRIGGER append_only_app_update BEFORE UPDATE ON public.consumable_ledger
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_app_role_update();
CREATE TRIGGER append_only_app_update BEFORE UPDATE ON public.billing_payments
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_app_role_update();
CREATE TRIGGER append_only_app_update BEFORE UPDATE ON public.raw_response_artifacts
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_app_role_update();
