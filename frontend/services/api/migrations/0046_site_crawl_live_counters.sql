-- Live counters persisted on the crawl row (owner decision CO-3): the
-- post-settle reconcile recounts an active crawl on a cadence and its reads
-- render this copy instead of scanning the crawl's tasks on every poll.
-- Applies in place: a nullable column is a catalog-only change, and a crawl
-- without a copy yet is counted from its tasks until its next settlement.

ALTER TABLE public.site_crawls ADD COLUMN live_counters jsonb;
