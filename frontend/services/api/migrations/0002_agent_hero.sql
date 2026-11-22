ALTER TABLE public.agent_messages ADD COLUMN views jsonb DEFAULT '[]'::jsonb NOT NULL;
