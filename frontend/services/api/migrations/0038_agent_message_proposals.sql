-- What an Agent reply proposed for the person to confirm: a JSON array of
-- `{kind: 'declaration', ...}` (the contract owns the shape). Only the
-- person's own click acts on one. Earlier messages carried none, so the
-- default fills them in place.

ALTER TABLE public.agent_messages
    ADD COLUMN proposals jsonb DEFAULT '[]'::jsonb NOT NULL;
