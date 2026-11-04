-- A chat holds several documents, and the Agent may search the web. Forward-only
-- and safe on existing rows.
--
-- Each document is numbered in the order the chat created it; the number is the
-- short label the model and the person use ("Document 2"). A chat's existing
-- single document becomes its Document 1.
ALTER TABLE public.agent_outputs
    ADD COLUMN number integer DEFAULT 1 NOT NULL;
ALTER TABLE public.agent_outputs
    ALTER COLUMN number DROP DEFAULT;
ALTER TABLE public.agent_outputs
    DROP CONSTRAINT uq_agent_output_chat;
ALTER TABLE public.agent_outputs
    ADD CONSTRAINT uq_agent_output_chat_number UNIQUE (chat_id, number);
ALTER TABLE public.agent_outputs
    ADD CONSTRAINT ck_agent_output_number_positive CHECK (number > 0);

-- The web pages a turn's searches returned, apart from CiteLadder records: a
-- reply's sources and a revision's carried provenance. Untrusted observations,
-- never facts.
ALTER TABLE public.agent_messages
    ADD COLUMN web_sources jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.agent_output_revisions
    ADD COLUMN web_sources jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Provider-hosted searches a call ran, billed per search beside its tokens.
-- NULL is unknown (no usage reported), distinct from zero searches.
ALTER TABLE public.agent_model_attempts
    ADD COLUMN web_search_requests integer;
