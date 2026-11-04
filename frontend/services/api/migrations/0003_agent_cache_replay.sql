-- The Agent replays a chat byte for byte and records how each call used the
-- prompt cache. Forward-only and safe on existing rows.
--
-- jsonb re-sorts object keys, so a stored tool call came back with its input
-- reordered and the replayed history missed the provider's cache. json keeps
-- the text exactly as written. Rows already stored keep their sorted order.
ALTER TABLE public.agent_run_transcripts
    ALTER COLUMN messages TYPE json USING messages::json;

-- Per call: the provider's response id (the next call names it for cache
-- diagnostics), one-hour cache writes (billed above five-minute ones), the
-- provider's cache-miss diagnosis and its per-step usage, compaction included.
ALTER TABLE public.agent_model_attempts
    ADD COLUMN response_id character varying(128) DEFAULT ''::character varying NOT NULL,
    ADD COLUMN cache_write_1h_input_tokens bigint,
    ADD COLUMN cache_miss_reason character varying(32) DEFAULT ''::character varying NOT NULL,
    ADD COLUMN cache_missed_input_tokens bigint,
    ADD COLUMN usage_iterations jsonb DEFAULT '[]'::jsonb NOT NULL;
