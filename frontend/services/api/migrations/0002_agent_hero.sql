ALTER TABLE public.agent_messages ADD COLUMN views jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE public.agent_chats
    ADD COLUMN model character varying(64) NOT NULL DEFAULT 'claude-haiku-5-5',
    ADD COLUMN reasoning_effort character varying(16) NOT NULL DEFAULT 'medium';

ALTER TABLE public.agent_chats
    ALTER COLUMN model DROP DEFAULT,
    ALTER COLUMN reasoning_effort DROP DEFAULT;

ALTER TABLE public.agent_chats
    ADD CONSTRAINT ck_agent_chats_reasoning_effort CHECK ((reasoning_effort IN ('low', 'medium', 'high')));

-- What happened to a change the Agent proposed. A decision (executed or
-- dismissed) is one row per proposal (message and index), written once and
-- before the change runs, so a card executes at most once and a failed change
-- leaves no decision. A refused confirm leaves the card open and appends a
-- refused row with the owner's reason, which the Agent's next turn reads. The
-- proposal itself stays in agent_messages.proposals.
CREATE TABLE public.agent_proposal_outcomes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    chat_id uuid NOT NULL,
    message_id uuid NOT NULL,
    proposal_index integer NOT NULL,
    state character varying(16) NOT NULL,
    reason character varying(500),
    user_id uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT agent_proposal_outcomes_pkey PRIMARY KEY (id),
    CONSTRAINT ck_agent_proposal_outcome_state CHECK (state IN ('executed', 'dismissed', 'refused')),
    CONSTRAINT ck_agent_proposal_outcome_reason CHECK ((state = 'refused') = (reason IS NOT NULL)),
    CONSTRAINT ck_agent_proposal_outcome_index CHECK (proposal_index >= 0),
    CONSTRAINT agent_proposal_outcomes_message_id_fkey FOREIGN KEY (message_id)
        REFERENCES public.agent_messages(id) ON DELETE CASCADE,
    CONSTRAINT agent_proposal_outcomes_chat_id_fkey FOREIGN KEY (chat_id)
        REFERENCES public.agent_chats(id) ON DELETE CASCADE,
    CONSTRAINT agent_proposal_outcomes_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    CONSTRAINT agent_proposal_outcomes_workspace_id_project_id_fkey
        FOREIGN KEY (workspace_id, project_id)
        REFERENCES public.projects(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT agent_proposal_outcomes_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_agent_proposal_outcome ON public.agent_proposal_outcomes USING btree (message_id, proposal_index) WHERE ((state)::text <> 'refused'::text);
CREATE INDEX ix_agent_proposal_outcomes_chat_id ON public.agent_proposal_outcomes USING btree (chat_id, created_at);
CREATE INDEX ix_agent_proposal_outcomes_project_id ON public.agent_proposal_outcomes USING btree (workspace_id, project_id);
CREATE INDEX ix_agent_proposal_outcomes_user_id ON public.agent_proposal_outcomes USING btree (user_id) WHERE (user_id IS NOT NULL);

REVOKE UPDATE, DELETE ON public.agent_proposal_outcomes FROM citeladder_app;

-- MCP offers a curated list of change kinds that grows in code
-- (MCP_CHANGE_KINDS); prepare and confirm both check the kind against it.
ALTER TABLE public.mcp_confirmations DROP CONSTRAINT ck_mcp_confirmations_kind;
