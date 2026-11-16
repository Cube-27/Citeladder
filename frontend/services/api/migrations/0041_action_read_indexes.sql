-- Actions v3 reads (plan v3, owner 2026-11-16). Forward-only, indexes only.
--
-- Every Actions read hides an Action whose live findings all have rules that
-- are no longer configured (`NOT_LEFTOVER_ACTION`) by probing that Action's
-- live findings. Each refresh supersedes every live finding and keeps its
-- `action_id`, so the partial index keeps the probe off that growing history.
--
-- `ix_actions_goal_grouping` (0040) is never chosen: the reads group by the
-- coalesced goal and grouping, and `ix_actions_effective_status` serves them.

CREATE INDEX ix_opportunities_live_action ON public.opportunities
    USING btree (action_id) WHERE superseded_at IS NULL;

DROP INDEX public.ix_actions_goal_grouping;
