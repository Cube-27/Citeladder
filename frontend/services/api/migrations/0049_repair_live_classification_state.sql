-- Live score summaries (0046) stored classification_state 'limited_evidence',
-- which the crawl contract rejects, so reads and cancels of those crawls failed.
-- Recompute it from the summary's own counts, as the snapshot does.

UPDATE public.site_crawls
SET score_summary = jsonb_set(
  score_summary,
  '{classification_state}',
  to_jsonb(
    CASE
      WHEN coalesce((score_summary ->> 'classification_expected_page_count')::int, 0) = 0
        THEN 'not_measured'
      WHEN (score_summary ->> 'classified_page_count')::int
        = (score_summary ->> 'classification_expected_page_count')::int
        THEN 'complete'
      ELSE 'partial'
    END
  )
)
WHERE score_summary ->> 'classification_state' = 'limited_evidence';
