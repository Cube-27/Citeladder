-- A full crawl now records every URL its sitemaps list as an observation, so
-- sitemap membership and each URL's declared `<lastmod>` live on the
-- observation instead of in a capped list in `site_crawls.site_facts`.
-- `sitemap_lastmod` is null when the sitemap declared none.

ALTER TABLE public.site_url_observations
    ADD COLUMN sitemap_member boolean DEFAULT false NOT NULL,
    ADD COLUMN sitemap_lastmod character varying(64);
