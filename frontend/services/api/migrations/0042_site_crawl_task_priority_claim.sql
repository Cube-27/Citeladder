-- A claim ranks the oldest due rows and the highest-priority due rows
-- (queue/task-queue.ts claimStatement). Site Health is the one lane whose due
-- backlog reaches tens of thousands (a sitemap admits every listed URL as a
-- discover), so its priority branch gets an index and stays bounded by the
-- candidate cap; every other lane's due set is small enough to sort.
-- Forward-only, index only.

CREATE INDEX ix_site_crawl_tasks_priority_claim ON public.site_crawl_tasks
    USING btree (priority DESC, available_at, id)
    WHERE status IN ('awaiting_provider_result', 'capacity_wait', 'queued', 'retry_wait',
        'submission_uncertain');
