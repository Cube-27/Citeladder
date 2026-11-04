-- The Agent's deliverable has one draft state: the outline phase, its approval
-- and the outline-approval run mode are removed. Forward-only and safe on
-- existing rows: the dropped columns carry no data any reader keeps.

ALTER TABLE public.agent_output_revisions
    DROP COLUMN approved_at,
    DROP COLUMN approved_by_user_id,
    DROP COLUMN phase;

ALTER TABLE public.agent_outputs
    DROP COLUMN phase;

ALTER TABLE public.agent_runs
    DROP COLUMN mode;
