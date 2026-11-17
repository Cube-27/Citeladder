-- Reversed snapshot provenance (owner decision CO-6): a snapshot stores its
-- analysis set as rows instead of id arrays, and keeps no list of evaluation
-- ids. Evaluations are reached through their analyses: each page analysis
-- names its own, and architecture evaluations through their crawl's
-- observed architecture. Applies in place: existing snapshots keep their
-- analysis sets as rows before the arrays are dropped.

CREATE TABLE public.site_health_snapshot_analyses (
    workspace_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    analysis_id uuid NOT NULL,
    CONSTRAINT site_health_snapshot_analyses_pkey PRIMARY KEY (snapshot_id, analysis_id),
    CONSTRAINT fk_site_health_snapshot_analyses_snapshot FOREIGN KEY (snapshot_id)
        REFERENCES public.site_health_snapshots(id) ON DELETE CASCADE,
    CONSTRAINT fk_site_health_snapshot_analyses_analysis FOREIGN KEY (analysis_id)
        REFERENCES public.site_page_analyses(id) ON DELETE CASCADE
);

-- Serves the analysis foreign key's cascade; reads go through the primary key.
CREATE INDEX ix_site_health_snapshot_analyses_analysis
    ON public.site_health_snapshot_analyses USING btree (analysis_id);

INSERT INTO public.site_health_snapshot_analyses (workspace_id, snapshot_id, analysis_id)
SELECT DISTINCT s.workspace_id, s.id, a.id
FROM public.site_health_snapshots s
CROSS JOIN LATERAL unnest(s.source_analysis_ids) AS listed(id)
JOIN public.site_page_analyses a ON a.id = listed.id AND a.workspace_id = s.workspace_id;

ALTER TABLE public.site_health_snapshots
    DROP COLUMN source_analysis_ids,
    DROP COLUMN source_evaluation_ids;
