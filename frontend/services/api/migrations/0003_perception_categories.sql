-- Perception categories are project themes. A theme the answer labeller names
-- because no existing one fits is saved with source 'model'; a person renames,
-- merges or deletes it like any other theme. Probe questions ask only about
-- research and user themes.
ALTER TABLE public.project_themes DROP CONSTRAINT ck_project_themes_source;

ALTER TABLE public.project_themes
    ADD CONSTRAINT ck_project_themes_source CHECK ((source IN ('research', 'user', 'model')));

CREATE INDEX ix_answer_perceptions_workspace_id_project_id ON public.answer_perceptions USING btree (workspace_id, project_id);
