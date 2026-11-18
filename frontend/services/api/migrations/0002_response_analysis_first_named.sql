-- Win rate (AV-7): the tracked business each answer names first, derived at
-- finalization from the stored mention offsets. NULL kind: analysed before this
-- derivation existed (unavailable); 'none': no tracked business named.
ALTER TABLE public.response_analyses
    ADD COLUMN first_named_kind character varying(16),
    ADD COLUMN first_named_name character varying(255),
    -- CASE, not OR: a NULL kind would make an OR clause UNKNOWN, which CHECK accepts.
    ADD CONSTRAINT ck_response_analyses_first_named CHECK (
        CASE
            WHEN first_named_kind IS NULL OR first_named_kind = 'none' THEN first_named_name IS NULL
            WHEN first_named_kind IN ('brand', 'competitor') THEN first_named_name IS NOT NULL
            ELSE false
        END
    );
