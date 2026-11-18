-- Win rate (AV-7): the tracked business each answer names first, derived at
-- finalization from the stored mention offsets. NULL kind: analysed before this
-- derivation existed (unavailable); 'none': no tracked business named.
ALTER TABLE public.response_analyses
    ADD COLUMN first_named_kind character varying(16),
    ADD COLUMN first_named_name character varying(255),
    ADD CONSTRAINT ck_response_analyses_first_named CHECK (
        first_named_kind IS NULL AND first_named_name IS NULL
        OR first_named_kind = 'none' AND first_named_name IS NULL
        OR first_named_kind IN ('brand', 'competitor') AND first_named_name IS NOT NULL
    );
