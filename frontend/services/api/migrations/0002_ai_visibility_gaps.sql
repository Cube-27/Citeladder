-- Win rate (AV-7): the tracked business each answer names first, derived at
-- finalization from the stored mention offsets. NULL kind: analysed before this
-- derivation existed (unavailable); 'none': no tracked business named.
ALTER TABLE public.response_analyses
    ADD COLUMN first_named_kind character varying(16),
    ADD COLUMN first_named_name character varying(255),
    -- CASE, not OR: a NULL kind would make an OR clause UNKNOWN, which CHECK accepts.
    ADD CONSTRAINT ck_response_analyses_first_named CHECK (
        CASE
            WHEN first_named_kind IS NULL OR first_named_kind = 'none' THEN first_named_name IS NULL
            WHEN first_named_kind IN ('brand', 'competitor') THEN first_named_name IS NOT NULL
            ELSE false
        END
    );

-- Topic dimension (AV-5): answers group by the topic their prompt had when the
-- run froze it, so refiling or renaming a topic never rewrites a past run. A
-- run's prompt snapshots freeze the topic and its name; finalization groups the
-- run's Sources facts by that topic and writes one metric block per topic. Runs
-- finalized before this froze no topic and read as not run in every topic.
ALTER TABLE public.audit_prompt_snapshots
    ADD COLUMN topic_id uuid,
    ADD COLUMN topic_name character varying(255),
    ADD CONSTRAINT ck_audit_prompt_snapshot_topic CHECK (((topic_id IS NULL) = (topic_name IS NULL)));

ALTER TABLE public.audit_answer_aggregates ADD COLUMN topic_id uuid;

ALTER TABLE public.audit_answer_aggregates DROP CONSTRAINT uq_audit_answer_aggregate;

ALTER TABLE ONLY public.audit_answer_aggregates
    ADD CONSTRAINT uq_audit_answer_aggregate UNIQUE NULLS NOT DISTINCT (audit_id, logical_engine, cohort, topic_id);

ALTER TABLE public.audit_source_aggregates ADD COLUMN topic_id uuid;

CREATE TABLE public.audit_topic_metrics (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    audit_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    topic_name character varying(255) NOT NULL,
    visibility_score double precision NOT NULL,
    metrics jsonb NOT NULL,
    -- The analyses the block counts, as metric_snapshots keeps them (invariant 5).
    source_analysis_ids jsonb NOT NULL,
    analyzer_version character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.audit_topic_metrics
    ADD CONSTRAINT audit_topic_metrics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_topic_metrics
    ADD CONSTRAINT uq_audit_topic_metric UNIQUE (audit_id, topic_id);

CREATE INDEX ix_audit_topic_metrics_workspace_id ON public.audit_topic_metrics USING btree (workspace_id);

ALTER TABLE ONLY public.audit_topic_metrics
    ADD CONSTRAINT audit_topic_metrics_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_topic_metrics
    ADD CONSTRAINT audit_topic_metrics_workspace_id_project_id_audit_id_fkey FOREIGN KEY (workspace_id, project_id, audit_id) REFERENCES public.audits(workspace_id, project_id, id) ON DELETE CASCADE;

-- Competitor suggestions (AV-11, W14): a candidate is a cited domain or a name the
-- perception call labelled; a person's accept or reject records who and when.
-- NULL counts: recorded before these columns existed.
ALTER TABLE public.observed_entity_candidates
    ADD COLUMN kind character varying(32) NOT NULL DEFAULT 'cited_domain',
    ADD COLUMN name_key character varying(255),
    ADD COLUMN citation_count integer,
    ADD COLUMN engine_total integer,
    ADD COLUMN decided_by_user_id uuid,
    ADD COLUMN decided_at timestamp with time zone,
    ALTER COLUMN domain DROP NOT NULL;

ALTER TABLE public.observed_entity_candidates
    ALTER COLUMN kind DROP DEFAULT,
    ADD CONSTRAINT ck_observed_candidate_kind CHECK (
        CASE kind
            WHEN 'cited_domain' THEN domain IS NOT NULL AND name_key IS NULL
            WHEN 'named_in_answers' THEN domain IS NULL AND name_key IS NOT NULL AND citation_count IS NULL
            ELSE false
        END
    ),
    ADD CONSTRAINT uq_observed_candidate_name UNIQUE (audit_id, name_key),
    ADD CONSTRAINT observed_entity_candidates_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- The untracked business names each answer's perception returned, verified
-- against its passages: raw observations, append-only.
CREATE TABLE public.answer_untracked_names (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    audit_id uuid NOT NULL,
    perception_id uuid NOT NULL,
    analysis_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    name_key character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT answer_untracked_names_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT uq_answer_untracked_name UNIQUE (perception_id, name_key);

CREATE INDEX ix_answer_untracked_names_audit_id ON public.answer_untracked_names USING btree (audit_id, name_key);

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT answer_untracked_names_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT answer_untracked_names_workspace_id_project_id_audit_id_fkey FOREIGN KEY (workspace_id, project_id, audit_id) REFERENCES public.audits(workspace_id, project_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT answer_untracked_names_perception_id_fkey FOREIGN KEY (perception_id) REFERENCES public.answer_perceptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.answer_untracked_names
    ADD CONSTRAINT answer_untracked_names_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.response_analyses(id) ON DELETE CASCADE;

-- Verdict overrides (AV-12, W15): a person's verdict on one claim, appended
-- beside the model's claim_verdicts row, which is never rewritten. Reads take
-- the newest override per verdict row. id is already the primary key, so the
-- (workspace_id, id) key holds for existing rows.
ALTER TABLE ONLY public.claim_verdicts
    ADD CONSTRAINT uq_claim_verdicts_ws_id UNIQUE (workspace_id, id);

CREATE TABLE public.claim_verdict_overrides (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    claim_verdict_id uuid NOT NULL,
    from_verdict character varying(16) NOT NULL,
    to_verdict character varying(16) NOT NULL,
    note text,
    created_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT claim_verdict_overrides_pkey PRIMARY KEY (id),
    CONSTRAINT ck_claim_verdict_override_from CHECK (from_verdict IN ('supported', 'contradicted', 'inconclusive', 'not_covered')),
    CONSTRAINT ck_claim_verdict_override_to CHECK (to_verdict IN ('supported', 'contradicted', 'inconclusive')),
    CONSTRAINT claim_verdict_overrides_workspace_id_claim_verdict_id_fkey FOREIGN KEY (workspace_id, claim_verdict_id) REFERENCES public.claim_verdicts(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT claim_verdict_overrides_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX ix_claim_verdict_overrides_ws_verdict_newest ON public.claim_verdict_overrides USING btree (workspace_id, claim_verdict_id, created_at DESC, id DESC);

-- Append-only: the app role adds overrides and never rewrites or removes them;
-- cascades still remove them with their verdict (referential actions run as owner).
REVOKE UPDATE, DELETE ON public.claim_verdict_overrides FROM citeladder_app;

-- Answer formats (AV-8): what a scraper answer showed besides text, parsed at
-- analysis from the answer's own stored artifact. 'not_applicable': an API
-- engine; 'unavailable': a scraper envelope without an item list; NULL: analysed
-- before this derivation existed (unavailable). In-text links are distinct link
-- targets written in the answer text, set only when the formats were observed.
ALTER TABLE public.response_analyses
    ADD COLUMN answer_format_state character varying(16),
    ADD COLUMN answer_formats text[],
    ADD COLUMN in_text_link_count integer,
    ADD CONSTRAINT ck_response_analyses_answer_formats CHECK (
        CASE
            WHEN answer_format_state = 'observed' THEN answer_formats IS NOT NULL AND in_text_link_count IS NOT NULL AND in_text_link_count >= 0
            WHEN answer_format_state IS NULL OR answer_format_state IN ('unavailable', 'not_applicable')
                THEN answer_formats IS NULL AND in_text_link_count IS NULL
            ELSE false
        END
    );

-- Fanout search terms (AV-8): one row per finalized run, the normalized words
-- of its answers' fanout queries with searches, share, tracked brands matched
-- and the share change against previous_audit_id (NULL: nothing to compare).
CREATE TABLE public.audit_fanout_terms (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    audit_id uuid NOT NULL,
    previous_audit_id uuid,
    total_searches integer NOT NULL,
    unreported_engines text[] NOT NULL,
    terms jsonb NOT NULL,
    source_analysis_ids jsonb NOT NULL,
    analyzer_version character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_audit_fanout_terms_total CHECK (total_searches >= 0)
);

ALTER TABLE ONLY public.audit_fanout_terms
    ADD CONSTRAINT audit_fanout_terms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_fanout_terms
    ADD CONSTRAINT uq_audit_fanout_terms_audit UNIQUE (audit_id);

CREATE INDEX ix_audit_fanout_terms_workspace_project ON public.audit_fanout_terms USING btree (workspace_id, project_id);

ALTER TABLE ONLY public.audit_fanout_terms
    ADD CONSTRAINT audit_fanout_terms_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_fanout_terms
    ADD CONSTRAINT audit_fanout_terms_workspace_id_project_id_audit_id_fkey FOREIGN KEY (workspace_id, project_id, audit_id) REFERENCES public.audits(workspace_id, project_id, id) ON DELETE CASCADE;

-- Append-only like the baseline observation tables: the app role inserts
-- untracked names and never rewrites or removes them (cascades run as owner).
REVOKE UPDATE, DELETE ON public.answer_untracked_names FROM citeladder_app;
