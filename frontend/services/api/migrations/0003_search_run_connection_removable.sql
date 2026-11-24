ALTER TABLE public.search_intelligence_runs ALTER COLUMN connection_id DROP NOT NULL;
ALTER TABLE public.search_intelligence_runs DROP CONSTRAINT search_intelligence_runs_connection_id_fkey;
ALTER TABLE public.search_intelligence_runs
    ADD CONSTRAINT search_intelligence_runs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.provider_connections(id) ON DELETE SET NULL;
