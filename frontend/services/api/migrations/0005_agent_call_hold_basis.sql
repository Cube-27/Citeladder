-- What each Agent model call's credit hold was sized from. Forward-only and safe
-- on existing rows, which keep NULL (not recorded).
--
-- input_bytes is the UTF-8 size of what the provider read; the next call of the
-- same turn sizes its input hold from this call's reported input tokens plus the
-- bytes added since. max_output_tokens is the output cap the call was sent
-- with: lowered when the balance covers less than the full cap; NULL is the
-- route's configured cap (an unmetered call).
ALTER TABLE public.agent_model_attempts
    ADD COLUMN input_bytes bigint;
ALTER TABLE public.agent_model_attempts
    ADD COLUMN max_output_tokens integer;
ALTER TABLE public.agent_model_attempts
    ADD CONSTRAINT ck_agent_model_attempt_input_bytes CHECK (input_bytes IS NULL OR input_bytes >= 0);
ALTER TABLE public.agent_model_attempts
    ADD CONSTRAINT ck_agent_model_attempt_max_output_tokens CHECK (max_output_tokens IS NULL OR max_output_tokens > 0);
