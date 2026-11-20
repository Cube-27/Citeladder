-- A project's URLs all belong to its workspace, but the planner multiplies the
-- two filters' selectivities: it estimated a project's tracked pages at a few
-- rows and nested-looped the Pages read over them (hundreds of ms at 1,500
-- pages, 12 ms with these dependencies).
CREATE STATISTICS public.st_site_urls_workspace_project (dependencies)
  ON workspace_id, project_id FROM public.site_urls;

CREATE STATISTICS public.st_monitored_site_urls_workspace_project (dependencies)
  ON workspace_id, project_id FROM public.monitored_site_urls;

ANALYZE public.site_urls, public.monitored_site_urls;
