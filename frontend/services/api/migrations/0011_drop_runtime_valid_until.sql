-- `workspace_site_health_runtime.resolved_valid_until` was written by every
-- runtime refresh and read by nothing. The runtime's one writer
-- (site-health/plan-runtime.ts) no longer writes it. Forward-only.
ALTER TABLE public.workspace_site_health_runtime DROP COLUMN resolved_valid_until;
