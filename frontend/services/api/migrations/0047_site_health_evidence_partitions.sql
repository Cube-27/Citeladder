-- Site Health evidence partitioned by crawl month (owner decision CO-6), so a
-- later retention policy is a partition drop. Converts the six tables in
-- place: new partitioned parents, monthly and default partitions, rows moved,
-- old tables dropped, then keys, indexes, foreign keys and grants recreated
-- under their original names.
--
-- The key is the owner id, a UUIDv7 whose leading 48 bits are its creation
-- time in milliseconds: crawl_id on the crawl's rows, analysis_id on rule
-- evaluations (they belong to their analysis, which snapshots reuse). A month
-- is the id range [first id of the month, first id of the next month), so
-- every read that names its crawl or analysis prunes, and writers already
-- carry the key. Rows keyed by an older random (v4) id land in the default
-- partition, or in whichever month range their random bits fall into.

-- The first UUIDv7 of a UTC month: its millisecond timestamp, zero bits after.
CREATE FUNCTION public.site_evidence_month_bound(p_month date) RETURNS uuid
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path = pg_catalog
AS $$
    SELECT (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-0000-0000-000000000000')::uuid
    FROM (SELECT lpad(to_hex((extract(epoch FROM date_trunc('month', p_month::timestamp)) * 1000)::bigint), 12, '0') AS h) AS t
$$;

-- One month's partition of one evidence table, unless it exists. Returns
-- 'created', 'exists', 'overlaps_default' (the default partition already
-- holds rows in that range: a forward migration must split it) or
-- 'lock_busy' (a writer held the parent; the next run retries).
CREATE FUNCTION public.site_evidence_month_partition(p_table text, p_month date) RETURNS text
    LANGUAGE plpgsql
    SET search_path = public, pg_catalog
    SET lock_timeout = '5s'
AS $$
DECLARE
    key text := CASE p_table WHEN 'site_rule_evaluations' THEN 'analysis_id' ELSE 'crawl_id' END;
    month date := date_trunc('month', p_month::timestamp)::date;
    lo uuid := site_evidence_month_bound(month);
    hi uuid := site_evidence_month_bound((month + interval '1 month')::date);
    part text := format('%s_p%s', p_table, to_char(month, 'YYYY_MM'));
    overlap boolean;
BEGIN
    IF p_table NOT IN ('site_crawl_events', 'site_fetch_artifacts', 'site_fetch_attempts',
                       'site_issues', 'site_rule_evaluations', 'site_url_observations') THEN
        RAISE EXCEPTION 'not a Site Health evidence table: %', p_table;
    END IF;
    IF to_regclass(format('public.%I', part)) IS NOT NULL THEN
        RETURN 'exists';
    END IF;
    -- The create takes this lock anyway; taking it first stops a writer
    -- filling the range between the check and the create.
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', p_table);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I >= $1 AND %I < $2)',
                   p_table || '_default', key, key)
        INTO overlap USING lo, hi;
    IF overlap THEN
        RETURN 'overlaps_default';
    END IF;
    EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)%s',
                   part, p_table, lo, hi,
                   CASE p_table WHEN 'site_url_observations' THEN ' WITH (fillfactor = 75)' ELSE '' END);
    -- The services reach rows only through the parent, whose grants apply.
    EXECUTE format('REVOKE ALL ON public.%I FROM citeladder_app', part);
    -- 0043's workspace/crawl dependency; a partition does not inherit it.
    IF p_table IN ('site_fetch_artifacts', 'site_issues', 'site_url_observations') THEN
        EXECUTE format('CREATE STATISTICS public.%I (dependencies) ON workspace_id, crawl_id FROM public.%I',
                       'st_' || part || '_workspace_crawl', part);
    END IF;
    RETURN 'created';
EXCEPTION WHEN lock_not_available THEN
    RETURN 'lock_busy';
END
$$;

-- The current UTC month and the next p_ahead months for every evidence
-- table. The migrate job runs it after each apply; returns what it skipped.
CREATE FUNCTION public.site_evidence_ensure_partitions(p_ahead integer DEFAULT 3) RETURNS text[]
    LANGUAGE plpgsql
    SET search_path = public, pg_catalog
AS $$
DECLARE
    tbl text;
    step integer;
    outcome text;
    skipped text[] := '{}';
    first_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['site_crawl_events', 'site_fetch_artifacts', 'site_fetch_attempts',
                               'site_issues', 'site_rule_evaluations', 'site_url_observations'] LOOP
        FOR step IN 0..p_ahead LOOP
            outcome := site_evidence_month_partition(tbl, (first_month + make_interval(months => step))::date);
            IF outcome NOT IN ('created', 'exists') THEN
                skipped := skipped || format('%s %s: %s', tbl,
                    to_char(first_month + make_interval(months => step), 'YYYY-MM'), outcome);
            END IF;
        END LOOP;
    END LOOP;
    RETURN skipped;
END
$$;

REVOKE ALL ON FUNCTION public.site_evidence_month_partition(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_evidence_ensure_partitions(integer) FROM PUBLIC;

-- Every foreign key into the six tables goes first; the old tables then drop
-- cleanly. Keys within a crawl come back below with the partition key. Keys
-- from durable projections (issue states, change observations, commerce
-- observations) do not: their rows outlive a dropped evidence month and keep
-- the source ids as recorded provenance (invariant 5), and they carry no
-- column holding the evidence row's key.
ALTER TABLE public.commerce_product_observations DROP CONSTRAINT commerce_product_observations_source_artifact_id_fkey;
ALTER TABLE public.site_change_observations
    DROP CONSTRAINT site_change_observations_source_artifact_a_id_fkey,
    DROP CONSTRAINT site_change_observations_source_artifact_b_id_fkey,
    DROP CONSTRAINT site_change_observations_source_evaluation_a_id_fkey,
    DROP CONSTRAINT site_change_observations_source_evaluation_b_id_fkey;
ALTER TABLE public.site_issue_states
    DROP CONSTRAINT site_issue_states_source_attempt_id_fkey,
    DROP CONSTRAINT site_issue_states_source_evaluation_id_fkey,
    DROP CONSTRAINT site_issue_states_source_issue_id_fkey;
ALTER TABLE public.site_crawl_tasks DROP CONSTRAINT fk_site_crawl_tasks_result_artifact_id;
ALTER TABLE public.site_page_analyses DROP CONSTRAINT site_page_analyses_artifact_id_fkey;
ALTER TABLE public.site_fetch_attempts DROP CONSTRAINT site_fetch_attempts_artifact_id_fkey;
ALTER TABLE public.site_issues
    DROP CONSTRAINT site_issues_evaluation_id_fkey,
    DROP CONSTRAINT site_issues_source_artifact_id_fkey;
ALTER TABLE public.site_rule_evaluations DROP CONSTRAINT site_rule_evaluations_source_artifact_id_fkey;
ALTER TABLE public.site_url_observations DROP CONSTRAINT site_url_observations_source_artifact_id_fkey;

ALTER TABLE public.site_crawl_events RENAME TO site_crawl_events_unpartitioned;
ALTER TABLE public.site_fetch_artifacts RENAME TO site_fetch_artifacts_unpartitioned;
ALTER TABLE public.site_fetch_attempts RENAME TO site_fetch_attempts_unpartitioned;
ALTER TABLE public.site_issues RENAME TO site_issues_unpartitioned;
ALTER TABLE public.site_rule_evaluations RENAME TO site_rule_evaluations_unpartitioned;
ALTER TABLE public.site_url_observations RENAME TO site_url_observations_unpartitioned;

-- LIKE keeps column order, defaults and NOT NULLs, and the CHECK constraints.
CREATE TABLE public.site_crawl_events (LIKE public.site_crawl_events_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (crawl_id);
CREATE TABLE public.site_fetch_artifacts (LIKE public.site_fetch_artifacts_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (crawl_id);
CREATE TABLE public.site_fetch_attempts (LIKE public.site_fetch_attempts_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (crawl_id);
CREATE TABLE public.site_issues (LIKE public.site_issues_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (crawl_id);
CREATE TABLE public.site_rule_evaluations (LIKE public.site_rule_evaluations_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (analysis_id);
CREATE TABLE public.site_url_observations (LIKE public.site_url_observations_unpartitioned INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    PARTITION BY RANGE (crawl_id);

CREATE TABLE public.site_crawl_events_default PARTITION OF public.site_crawl_events DEFAULT;
CREATE TABLE public.site_fetch_artifacts_default PARTITION OF public.site_fetch_artifacts DEFAULT;
CREATE TABLE public.site_fetch_attempts_default PARTITION OF public.site_fetch_attempts DEFAULT;
CREATE TABLE public.site_issues_default PARTITION OF public.site_issues DEFAULT;
CREATE TABLE public.site_rule_evaluations_default PARTITION OF public.site_rule_evaluations DEFAULT;
CREATE TABLE public.site_url_observations_default PARTITION OF public.site_url_observations DEFAULT WITH (fillfactor = 75);
REVOKE ALL ON public.site_crawl_events_default, public.site_fetch_artifacts_default,
    public.site_fetch_attempts_default, public.site_issues_default,
    public.site_rule_evaluations_default, public.site_url_observations_default FROM citeladder_app;
-- 0043's workspace/crawl statistics, for the default partitions (months get
-- theirs in site_evidence_month_partition); the parents' follow the drop below.
CREATE STATISTICS public.st_site_url_observations_default_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_url_observations_default;
CREATE STATISTICS public.st_site_fetch_artifacts_default_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_fetch_artifacts_default;
CREATE STATISTICS public.st_site_issues_default_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_issues_default;

-- A month for every existing UUIDv7 key, so those rows never sit in the
-- default partition, then the current month and the three ahead.
SELECT public.site_evidence_month_partition(t.tbl, t.month)
FROM (
    SELECT DISTINCT 'site_crawl_events' AS tbl, crawl_id AS key FROM public.site_crawl_events_unpartitioned
    UNION SELECT DISTINCT 'site_fetch_artifacts', crawl_id FROM public.site_fetch_artifacts_unpartitioned
    UNION SELECT DISTINCT 'site_fetch_attempts', crawl_id FROM public.site_fetch_attempts_unpartitioned
    UNION SELECT DISTINCT 'site_issues', crawl_id FROM public.site_issues_unpartitioned
    UNION SELECT DISTINCT 'site_rule_evaluations', analysis_id FROM public.site_rule_evaluations_unpartitioned
    UNION SELECT DISTINCT 'site_url_observations', crawl_id FROM public.site_url_observations_unpartitioned
) AS k
CROSS JOIN LATERAL (
    SELECT k.tbl, date_trunc('month', to_timestamp(
        ('x' || substr(replace(k.key::text, '-', ''), 1, 12))::bit(48)::bigint / 1000.0) AT TIME ZONE 'UTC')::date AS month
) AS t
WHERE substr(k.key::text, 15, 1) = '7'
GROUP BY t.tbl, t.month;
SELECT public.site_evidence_ensure_partitions();

INSERT INTO public.site_crawl_events SELECT * FROM public.site_crawl_events_unpartitioned;
INSERT INTO public.site_fetch_artifacts SELECT * FROM public.site_fetch_artifacts_unpartitioned;
INSERT INTO public.site_fetch_attempts SELECT * FROM public.site_fetch_attempts_unpartitioned;
INSERT INTO public.site_issues SELECT * FROM public.site_issues_unpartitioned;
INSERT INTO public.site_rule_evaluations SELECT * FROM public.site_rule_evaluations_unpartitioned;
INSERT INTO public.site_url_observations SELECT * FROM public.site_url_observations_unpartitioned;

DROP TABLE public.site_crawl_events_unpartitioned;
DROP TABLE public.site_fetch_artifacts_unpartitioned;
DROP TABLE public.site_fetch_attempts_unpartitioned;
DROP TABLE public.site_issues_unpartitioned;
DROP TABLE public.site_rule_evaluations_unpartitioned;
DROP TABLE public.site_url_observations_unpartitioned;

-- The parents' copies serve plans that span partitions.
CREATE STATISTICS public.st_site_url_observations_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_url_observations;
CREATE STATISTICS public.st_site_fetch_artifacts_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_fetch_artifacts;
CREATE STATISTICS public.st_site_issues_workspace_crawl (dependencies)
    ON workspace_id, crawl_id FROM public.site_issues;

-- Keys and unique constraints add the partition key. Each unique constraint
-- stays as strict as before: the crawl follows from the task, and the
-- analysis from the evaluation (the composite foreign keys below).
ALTER TABLE public.site_crawl_events ADD CONSTRAINT site_crawl_events_pkey PRIMARY KEY (id, crawl_id);
CREATE INDEX ix_site_crawl_events_crawl_id_created_at_id ON public.site_crawl_events USING btree (crawl_id, created_at, id);
CREATE INDEX ix_site_crawl_events_created_at ON public.site_crawl_events USING btree (created_at);

ALTER TABLE public.site_fetch_artifacts
    ADD CONSTRAINT site_fetch_artifacts_pkey PRIMARY KEY (id, crawl_id),
    ADD CONSTRAINT uq_site_fetch_artifact_task UNIQUE (task_id, crawl_id);
CREATE INDEX ix_site_fetch_artifacts_crawl_id ON public.site_fetch_artifacts USING btree (crawl_id);
CREATE INDEX ix_site_fetch_artifacts_workspace_id ON public.site_fetch_artifacts USING btree (workspace_id);

ALTER TABLE public.site_fetch_attempts
    ADD CONSTRAINT site_fetch_attempts_pkey PRIMARY KEY (id, crawl_id),
    ADD CONSTRAINT uq_site_fetch_attempt_call UNIQUE (task_id, attempt_number, request_ordinal, crawl_id);
CREATE INDEX ix_site_fetch_attempts_artifact_id ON public.site_fetch_attempts USING btree (artifact_id) WHERE artifact_id IS NOT NULL;
CREATE INDEX ix_site_fetch_attempts_crawl_id ON public.site_fetch_attempts USING btree (crawl_id);
CREATE INDEX ix_site_fetch_attempts_workspace_id ON public.site_fetch_attempts USING btree (workspace_id);

-- Nothing reads evaluations by artifact, and its foreign key is gone (the
-- evaluation's artifact is its analysis'), so its index goes too.
ALTER TABLE public.site_rule_evaluations
    ADD CONSTRAINT site_rule_evaluations_pkey PRIMARY KEY (id, analysis_id),
    ADD CONSTRAINT uq_site_rule_evaluation UNIQUE NULLS NOT DISTINCT (analysis_id, rule_id, source_architecture_id);
CREATE INDEX ix_site_rule_evaluations_source_architecture_id ON public.site_rule_evaluations USING btree (source_architecture_id) WHERE source_architecture_id IS NOT NULL;
CREATE INDEX ix_site_rule_evaluations_workspace_id ON public.site_rule_evaluations USING btree (workspace_id);

ALTER TABLE public.site_issues
    ADD CONSTRAINT site_issues_pkey PRIMARY KEY (id, crawl_id),
    ADD CONSTRAINT uq_site_issue_evaluation UNIQUE (evaluation_id, crawl_id);
CREATE INDEX ix_site_issues_analysis_id ON public.site_issues USING btree (analysis_id);
CREATE INDEX ix_site_issues_current ON public.site_issues USING btree (crawl_id, finding_class) WHERE is_current;
CREATE INDEX ix_site_issues_filter ON public.site_issues USING btree (crawl_id, finding_class, severity, category, rule_id);
CREATE INDEX ix_site_issues_source_artifact_id ON public.site_issues USING btree (source_artifact_id);
CREATE INDEX ix_site_issues_url_created ON public.site_issues USING btree (site_url_id, created_at);
CREATE INDEX ix_site_issues_workspace_project ON public.site_issues USING btree (workspace_id, project_id);

ALTER TABLE public.site_url_observations
    ADD CONSTRAINT site_url_observations_pkey PRIMARY KEY (id, crawl_id),
    ADD CONSTRAINT uq_site_url_observation UNIQUE (crawl_id, site_url_id);
CREATE INDEX ix_site_url_observations_parent_site_url_id ON public.site_url_observations USING btree (parent_site_url_id) WHERE parent_site_url_id IS NOT NULL;
CREATE INDEX ix_site_url_observations_site_url_id ON public.site_url_observations USING btree (site_url_id);
CREATE INDEX ix_site_url_observations_source_artifact_id ON public.site_url_observations USING btree (source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX ix_site_url_observations_workspace_project ON public.site_url_observations USING btree (workspace_id, project_id);

-- Foreign keys out of the evidence tables, as before.
ALTER TABLE public.site_crawl_events
    ADD CONSTRAINT site_crawl_events_workspace_id_crawl_id_fkey FOREIGN KEY (workspace_id, crawl_id) REFERENCES public.site_crawls(workspace_id, id) ON DELETE CASCADE;
ALTER TABLE public.site_fetch_artifacts
    ADD CONSTRAINT site_fetch_artifacts_crawl_id_fkey FOREIGN KEY (crawl_id) REFERENCES public.site_crawls(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_fetch_artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.site_crawl_tasks(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_fetch_artifacts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_fetch_attempts
    ADD CONSTRAINT site_fetch_attempts_crawl_id_fkey FOREIGN KEY (crawl_id) REFERENCES public.site_crawls(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_fetch_attempts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.site_crawl_tasks(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_fetch_attempts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_rule_evaluations
    ADD CONSTRAINT site_rule_evaluations_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.site_page_analyses(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_rule_evaluations_source_architecture_id_fkey FOREIGN KEY (source_architecture_id) REFERENCES public.site_observed_architectures(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_rule_evaluations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_issues
    ADD CONSTRAINT site_issues_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.site_page_analyses(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_issues_crawl_id_fkey FOREIGN KEY (crawl_id) REFERENCES public.site_crawls(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_issues_site_url_id_fkey FOREIGN KEY (site_url_id) REFERENCES public.site_urls(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_issues_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD CONSTRAINT site_issues_workspace_id_project_id_fkey FOREIGN KEY (workspace_id, project_id) REFERENCES public.projects(workspace_id, id) ON DELETE CASCADE;
ALTER TABLE public.site_url_observations
    ADD CONSTRAINT fk_site_url_observation_crawl_scoped FOREIGN KEY (workspace_id, project_id, crawl_id) REFERENCES public.site_crawls(workspace_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_site_url_observation_site_url_scoped FOREIGN KEY (workspace_id, project_id, site_url_id) REFERENCES public.site_urls(workspace_id, project_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT site_url_observations_parent_site_url_id_fkey FOREIGN KEY (parent_site_url_id) REFERENCES public.site_urls(id) ON DELETE SET NULL,
    ADD CONSTRAINT site_url_observations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Foreign keys into the evidence tables name the target's partition key. An
-- artifact belongs to the crawl of the row that points at it (an analyze task
-- reuses only its own crawl's discover artifact); an issue's evaluation
-- belongs to the issue's analysis. SET NULL clears only the reference.
ALTER TABLE public.site_fetch_attempts
    ADD CONSTRAINT site_fetch_attempts_artifact_id_fkey FOREIGN KEY (crawl_id, artifact_id) REFERENCES public.site_fetch_artifacts(crawl_id, id) ON DELETE SET NULL (artifact_id);
ALTER TABLE public.site_url_observations
    ADD CONSTRAINT site_url_observations_source_artifact_id_fkey FOREIGN KEY (crawl_id, source_artifact_id) REFERENCES public.site_fetch_artifacts(crawl_id, id) ON DELETE SET NULL (source_artifact_id);
ALTER TABLE public.site_issues
    ADD CONSTRAINT site_issues_source_artifact_id_fkey FOREIGN KEY (crawl_id, source_artifact_id) REFERENCES public.site_fetch_artifacts(crawl_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT site_issues_evaluation_id_fkey FOREIGN KEY (analysis_id, evaluation_id) REFERENCES public.site_rule_evaluations(analysis_id, id) ON DELETE CASCADE;
ALTER TABLE public.site_crawl_tasks
    ADD CONSTRAINT fk_site_crawl_tasks_result_artifact_id FOREIGN KEY (crawl_id, result_artifact_id) REFERENCES public.site_fetch_artifacts(crawl_id, id) ON DELETE SET NULL (result_artifact_id);
ALTER TABLE public.site_page_analyses
    ADD CONSTRAINT site_page_analyses_artifact_id_fkey FOREIGN KEY (crawl_id, artifact_id) REFERENCES public.site_fetch_artifacts(crawl_id, id) ON DELETE CASCADE;

-- New parents take the schema's default grants; attempts and artifacts stay
-- append-only for the services (invariant 17).
REVOKE UPDATE, DELETE ON public.site_fetch_attempts, public.site_fetch_artifacts FROM citeladder_app;
