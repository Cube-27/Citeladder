-- Fewer index writes per analyzed page. Indexes and storage parameters only:
-- no row changes, so it applies in place to existing data.

-- Only architecture findings carry a source architecture; every page
-- evaluation stored a NULL key here. The foreign-key lookup's equality
-- implies IS NOT NULL, so the partial index still serves it.
DROP INDEX public.ix_site_rule_evaluations_source_architecture_id;
CREATE INDEX ix_site_rule_evaluations_source_architecture_id
    ON public.site_rule_evaluations USING btree (source_architecture_id)
    WHERE source_architecture_id IS NOT NULL;

-- One workspace-led index replaces a workspace-only and a project-only index
-- (owner decision CO-5): every project read also filters by workspace, and
-- the (workspace_id, project_id) foreign key to projects matches it exactly.
DROP INDEX public.ix_site_issues_workspace_id;
DROP INDEX public.ix_site_issues_project_id;
CREATE INDEX ix_site_issues_workspace_project
    ON public.site_issues USING btree (workspace_id, project_id);
DROP INDEX public.ix_site_page_analyses_workspace_id;
DROP INDEX public.ix_site_page_analyses_project_id;
CREATE INDEX ix_site_page_analyses_workspace_project
    ON public.site_page_analyses USING btree (workspace_id, project_id);
DROP INDEX public.ix_site_url_observations_workspace_id;
DROP INDEX public.ix_site_url_observations_project_id;
CREATE INDEX ix_site_url_observations_workspace_project
    ON public.site_url_observations USING btree (workspace_id, project_id);

-- The key spells out the task slot (crawl, kind, URL hash, generation), which
-- uq_site_crawl_task_slot already keeps unique; nothing looks a task up by it.
ALTER TABLE public.site_crawl_tasks DROP CONSTRAINT uq_site_crawl_task_idempotency_key;

-- Rows updated as a crawl runs keep room on their page, so the update can be
-- HOT and skip every index. Existing pages keep their fill until rewritten.
ALTER TABLE public.site_discovery_frontier SET (fillfactor = 75);
ALTER TABLE public.site_url_observations SET (fillfactor = 75);
ALTER TABLE public.site_urls SET (fillfactor = 75);
