-- Each URL a full crawl's sitemaps list, with its first declared `<lastmod>`
-- (null when none): the authority for sitemap membership, replacing the
-- capped list in `site_crawls.site_facts`. Append-only, one row per crawl and
-- site URL; the URL's observation in the same crawl carries the sighting.

CREATE TABLE public.site_sitemap_entries (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    crawl_id uuid NOT NULL,
    site_url_id uuid NOT NULL,
    listed_url character varying(2048) NOT NULL,
    lastmod character varying(64),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT site_sitemap_entries_pkey PRIMARY KEY (id),
    CONSTRAINT uq_site_sitemap_entry UNIQUE (crawl_id, site_url_id),
    CONSTRAINT fk_site_sitemap_entry_crawl_scoped FOREIGN KEY (workspace_id, project_id, crawl_id)
        REFERENCES public.site_crawls(workspace_id, project_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_site_sitemap_entry_site_url_scoped FOREIGN KEY (workspace_id, project_id, site_url_id)
        REFERENCES public.site_urls(workspace_id, project_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_site_sitemap_entries_site_url_id
    ON public.site_sitemap_entries USING btree (site_url_id);
CREATE INDEX ix_site_sitemap_entries_workspace_project
    ON public.site_sitemap_entries USING btree (workspace_id, project_id);
