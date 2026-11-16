-- Actions v3 data (plan v3, owner 2026-11-16). Forward-only and safe on
-- existing rows: no backfill, the next Opportunity refresh fills them.
--
-- `goal` and `goal_grouping` are where action sync files each Action on the
-- Actions page (`config/actions.ts` ACTION_GOALS), so every count there is one
-- indexed group-by. Null until the Action's project is next refreshed; reads
-- show such a row under the fallback grouping.
--
-- `action_urls` holds the URLs an Action touches: an issue group's cohort, a
-- page Action's one URL. Action sync rewrites an Action's rows in the refresh
-- transaction. Indexed both ways: an Action's URLs, a URL's Actions.

ALTER TABLE public.actions
    ADD COLUMN goal character varying(32),
    ADD COLUMN goal_grouping character varying(32),
    ADD CONSTRAINT uq_actions_scoped UNIQUE (workspace_id, project_id, id);

CREATE INDEX ix_actions_goal_grouping ON public.actions
    USING btree (project_id, effective_status, goal, goal_grouping, priority_score DESC, id);

CREATE TABLE public.action_urls (
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    action_id uuid NOT NULL,
    site_url_id uuid NOT NULL,
    CONSTRAINT action_urls_pkey PRIMARY KEY (action_id, site_url_id),
    CONSTRAINT fk_action_urls_action_scoped FOREIGN KEY (workspace_id, project_id, action_id)
        REFERENCES public.actions(workspace_id, project_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_action_urls_site_url_scoped FOREIGN KEY (workspace_id, project_id, site_url_id)
        REFERENCES public.site_urls(workspace_id, project_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_action_urls_site_url ON public.action_urls
    USING btree (site_url_id, action_id);
CREATE INDEX ix_action_urls_workspace_project ON public.action_urls
    USING btree (workspace_id, project_id);
