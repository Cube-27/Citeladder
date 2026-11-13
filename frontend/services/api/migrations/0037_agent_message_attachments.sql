-- A long paste in the composer travels as an attachment beside the typed
-- message instead of inside it: a JSON array of `{kind: 'pasted_text', text}`
-- (the contract owns the shape). Earlier messages carried none, so the
-- default fills them in place.

ALTER TABLE public.agent_messages
    ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb NOT NULL;
