-- A managed workspace's monthly platform budget counts a deleted project's
-- answers (B20, DB-007). Answer-engine cost rows outlive their audit since
-- 0034, but admission read the budget month and funding from the audit, so a
-- project deletion dropped its spend from the month. Each cost row now carries
-- the budget month of the platform-funded audit it priced; null when the
-- workspace's own keys paid. The funding account is the workspace's one
-- billing account. Greenfield: no backfill.

ALTER TABLE public.execution_cost_projections
    ADD COLUMN funded_budget_period_start timestamp with time zone;
CREATE INDEX ix_execution_cost_projections_funded_budget ON public.execution_cost_projections
    USING btree (workspace_id, funded_budget_period_start)
    WHERE funded_budget_period_start IS NOT NULL;
