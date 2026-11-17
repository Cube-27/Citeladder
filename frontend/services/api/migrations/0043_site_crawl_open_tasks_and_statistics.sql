-- Every Site Health task settle asks whether the crawl still has open tasks
-- (lifecycle.ts settledRow); without this index each ask scanned every crawl's
-- task history. The query inlines the same terminal statuses so the planner
-- can prove the predicate.
CREATE INDEX ix_site_crawl_tasks_open ON public.site_crawl_tasks
    USING btree (crawl_id, task_kind)
    WHERE status NOT IN ('cancelled', 'failed', 'succeeded');

-- A crawl belongs to one workspace, so workspace_id and crawl_id are
-- dependent. Without these statistics the planner multiplies their
-- selectivities and picks the single-column workspace_id index for per-crawl
-- reads, which then grow with the workspace's crawl history.
CREATE STATISTICS st_site_crawl_tasks_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_crawl_tasks;
CREATE STATISTICS st_site_discovery_frontier_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_discovery_frontier;
CREATE STATISTICS st_site_url_observations_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_url_observations;
CREATE STATISTICS st_site_fetch_artifacts_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_fetch_artifacts;
CREATE STATISTICS st_site_page_analyses_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_page_analyses;
CREATE STATISTICS st_site_issues_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_issues;

ANALYZE public.site_crawl_tasks, public.site_discovery_frontier, public.site_url_observations,
    public.site_fetch_artifacts, public.site_page_analyses, public.site_issues;
