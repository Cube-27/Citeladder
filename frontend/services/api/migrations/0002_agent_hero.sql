ALTER TABLE public.agent_messages ADD COLUMN views jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE public.agent_chats
    ADD COLUMN model character varying(64) NOT NULL DEFAULT 'claude-haiku-5-5',
    ADD COLUMN reasoning_effort character varying(16) NOT NULL DEFAULT 'medium';

ALTER TABLE public.agent_chats
    ALTER COLUMN model DROP DEFAULT,
    ALTER COLUMN reasoning_effort DROP DEFAULT;

ALTER TABLE public.agent_chats
    ADD CONSTRAINT ck_agent_chats_reasoning_effort CHECK ((reasoning_effort IN ('low', 'medium', 'high')));
