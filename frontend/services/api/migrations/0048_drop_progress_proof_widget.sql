-- The Overview's progress_proof widget is retired and its key leaves the
-- widget enum, which saved layouts are parsed against. Strip it from every
-- saved layout; a layout left with no widget falls back to the default (NULL).

UPDATE public.overview_layouts
SET widgets = (
  SELECT jsonb_agg(widget ORDER BY position)
  FROM jsonb_array_elements(widgets) WITH ORDINALITY AS entry (widget, position)
  WHERE widget ->> 'key' <> 'progress_proof'
)
WHERE widgets @> '[{"key": "progress_proof"}]';
